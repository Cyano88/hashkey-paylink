import { submitSupportConversation } from './support-conversation.js'
import { pocketActivityStore } from './activity-store.js'
import { activityFeedKey } from './activity-feed.js'
import { reportTransaction, transactionReportKey, transactionReportDetails, validateTransactionReport, upsertTransactionReport } from './transaction-report.js'
import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { archivePayment } from '../og-storage.js'
import { mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import { circlePocketIdentityErrorStatus, circlePocketIdentityId, resolveCirclePocketIdentity } from '../circle-pocket-identity.js'
import { localCurrencyProfileRepository } from '../local-currency-profile.js'
import { advancePocketSupportLifecycle, type PocketSupportLifecycleMessage } from './support-case-lifecycle.js'

type SupportMessage = PocketSupportLifecycleMessage
type SupportCase = {
  id: string
  profileId: string
  status: 'open' | 'assigned' | 'waiting_user' | 'resolved'
  category: 'bank_identity' | 'bank_payment' | 'stuck_transaction' | 'account' | 'other'
  priority: 'normal' | 'high'
  summary: string
  transactionKey?: string
  transaction?: ReturnType<typeof transactionReportDetails>
  reportReason?: string
  reference?: string
  assignedTo?: string
  humanSupport?: boolean
  customer?: { fullName: string; email: string; pocketId: string }
  messages: SupportMessage[]
  proof?: { rootHash: string; ogTxHash: string; ogExplorer: string }
  createdAt: number
  updatedAt: number
  waitingSince?: number
  reminderSentAt?: number
  resolvedAt?: number
  customerReadAt?: number
}
type SupportStore = { cases: Record<string, SupportCase>; staffNames?: Record<string, string> }

const STORE_KEY = (process.env.POCKET_SUPPORT_STORE_KEY || 'hashpaylink:pocket-support:v1').trim()

function clean(value: unknown, max = 500) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) }
function bearer(req: Request) { return String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '' }
function linkedEmail(user: User) {
  for (const account of user.linkedAccounts || []) if (account.type === 'email' && typeof account.address === 'string') return account.address.trim().toLowerCase()
  return ''
}
async function verifiedStaff(req: Request) {
  const appId = (process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '').trim()
  const secret = (process.env.PRIVY_APP_SECRET || '').trim()
  const allowed = new Set((process.env.DEVELOPER_ADMIN_EMAILS || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))
  const allowedUserIds = new Set((process.env.DEVELOPER_ADMIN_USER_IDS || '').split(',').map(item => item.trim()).filter(Boolean))
  if (!appId || !secret || (!allowed.size && !allowedUserIds.size)) throw Object.assign(new Error('Support staff access is not configured.'), { status: 503 })
  const token = bearer(req)
  if (!token) throw Object.assign(new Error('Staff sign-in required.'), { status: 401 })
  const client = new PrivyClient(appId, secret)
  const claims = await client.verifyAuthToken(token)
  const email = linkedEmail(await client.getUserById(claims.userId))
  if (!allowedUserIds.has(claims.userId) && (!email || !allowed.has(email))) throw Object.assign(new Error('This account is not allowed to manage support.'), { status: 403 })
  return { email: email || claims.userId, userId: claims.userId }
}
async function store() { return (await readDurableJson<SupportStore>(STORE_KEY)) || { cases: {} } }
async function currentStore() {
  const current = await store()
  if (!advancePocketSupportLifecycle(current.cases, Date.now(), () => crypto.randomUUID())) return current
  return mutateDurableJson<SupportStore>(STORE_KEY, stored => {
    const next = stored || { cases: {} }
    advancePocketSupportLifecycle(next.cases, Date.now(), () => crypto.randomUUID())
    return next
  })
}
function publicCase(item: SupportCase) {
  const { profileId: _profileId, assignedTo: _assignedTo, customer: _customer, ...safe } = item
  const lastReadAt = item.customerReadAt || 0
  const unreadCount = item.messages.filter(message => (
    (message.author === 'staff' || message.kind === 'automatic_reminder' || message.kind === 'automatic_resolution')
    && message.createdAt > lastReadAt
  )).length
  return { ...safe, humanSupport: Boolean(item.humanSupport || item.assignedTo || item.category !== 'other' || item.messages.some(m => m.author === 'staff' || m.kind === 'transaction_report')), unreadCount }
}

export async function redactPocketSupportCases(profileId: string) {
  const deletedProfileId = 'deleted:' + crypto.createHash('sha256').update(profileId).digest('hex').slice(0, 24)
  await mutateDurableJson<SupportStore>(STORE_KEY, current => {
    const next = current || { cases: {} }
    for (const item of Object.values(next.cases)) {
      if (item.profileId !== profileId) continue
      item.profileId = deletedProfileId
      delete item.customer
    }
    return next
  })
}

async function privateCustomerIdentity(identity: Awaited<ReturnType<typeof resolveCirclePocketIdentity>>) {
  if (identity.kind !== 'privy') return undefined
  const profile = await localCurrencyProfileRepository.get(identity.subject)
  if (!profile) return undefined
  const fullName = clean(profile.resolvedName || [profile.firstName, profile.lastName].filter(Boolean).join(' '), 160)
  return { fullName, email: clean(profile.email, 240).toLowerCase(), pocketId: clean(profile.pocketId || profile.pocketNumber, 20) }
}

export default async function pocketSupportCasesHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    const action = clean(req.body?.action || req.query.action, 40) || (req.method === 'GET' ? 'list-mine' : 'create')
    if (action.startsWith('staff-')) {
      const staff = await verifiedStaff(req)
      if (action === 'staff-profile') {
        const displayName = clean(req.body?.displayName, 60)
        if (!displayName) return res.status(400).json({ok:false,error:'Enter your support display name.'})
        await mutateDurableJson<SupportStore>(STORE_KEY, current => ({...current, cases:current?.cases || {}, staffNames:{...current?.staffNames,[staff.userId]:displayName}}))
        return res.json({ok:true,displayName})
      }
      if (!['staff-list','staff-reply','staff-assign','staff-resolve'].includes(action)) return res.status(400).json({ok:false,error:'Unknown support action.'})
      if (action === 'staff-list') {
        const rows = Object.values((await currentStore()).cases).sort((a, b) => b.updatedAt - a.updatedAt)
        return res.json({ ok: true, cases: rows, displayName: (await store()).staffNames?.[staff.userId] || '' })
      }
      const caseId = clean(req.body?.caseId, 80)
      let saved: SupportCase | undefined
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next = current || { cases: {} }
        const item = next.cases[caseId]
        if (!item) throw Object.assign(new Error('Support case not found.'), { status: 404 })
        const now = Date.now()
        if (action === 'staff-reply') {
          const text = clean(req.body?.message, 1500)
          if (!text) throw Object.assign(new Error('Reply is required.'), { status: 400 })
          item.messages = [...item.messages, { id: crypto.randomUUID(), author: 'staff', displayName: next.staffNames?.[staff.userId] || 'Pocket Support', text, createdAt: now }]
          item.status = req.body?.resolve === true ? 'resolved' : 'waiting_user'
          item.waitingSince = req.body?.resolve === true ? undefined : now
          item.reminderSentAt = undefined
          item.resolvedAt = req.body?.resolve === true ? now : undefined
        } else if (action === 'staff-assign') {
          item.status = 'assigned'
          item.waitingSince = undefined
          item.reminderSentAt = undefined
          item.resolvedAt = undefined
        } else if (action === 'staff-resolve') {
          item.status = 'resolved'
          item.waitingSince = undefined
          item.reminderSentAt = undefined
          item.resolvedAt = now
        }
        item.assignedTo = staff.email
        item.updatedAt = now
        saved = item
        return next
      })
      return res.json({ ok: true, case: saved })
    }

    const identity = await resolveCirclePocketIdentity(req)
    const profileId = circlePocketIdentityId(identity)
    if (req.method === 'GET' || action === 'list-mine') {
      const rows = Object.values((await currentStore()).cases).filter(item => item.profileId === profileId).sort((a, b) => b.updatedAt - a.updatedAt)
      return res.json({ ok: true, cases: rows.map(publicCase) })
    }
    if (action === 'chat') {
      if (identity.kind !== 'privy') return res.status(401).json({ok:false,error:'Sign in to Pocket to contact Support.'})
      let saved: SupportCase | undefined
      const customer = await privateCustomerIdentity(identity)
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next = current || {cases:{}}
        saved = submitSupportConversation(next.cases, {profileId,caseId:clean(req.body?.caseId,80)||undefined,message:String(req.body?.message||'').trim(),requestId:clean(req.body?.requestId,80)}, Date.now(), () => crypto.randomUUID())
        saved.customer ||= customer
        return next
      })
      return res.json({ok:true,case:saved && publicCase(saved)})
    }
    if (action === 'transaction-report' || action === 'transaction-report-status') {
      if(identity.kind!=='privy') return res.status(401).json({ok:false,error:'Sign in to Pocket to report this transaction.'})
      const feed=await pocketActivityStore.read(activityFeedKey(identity.subject))
      const row=reportTransaction(Object.values(feed?.sources||{}).flatMap(source=>source.snapshot.payments),req.body?.transaction)
      const transactionKey=transactionReportKey(row)
      if(action==='transaction-report-status') {
        const existing=Object.values((await currentStore()).cases).find(item=>item.profileId===profileId&&item.transactionKey===transactionKey&&item.status!=='resolved')
        return res.json({ok:true,case:existing?publicCase(existing):null})
      }
      const report=validateTransactionReport(req.body?.reason,req.body?.description)
      const now=Date.now(),transaction=transactionReportDetails(row,now),customer=await privateCustomerIdentity(identity)
      const item:SupportCase={id:'pcs_'+crypto.randomUUID().replace(/-/g,'').slice(0,16),profileId,status:'open',humanSupport:true,priority:'high',
        category:row.source?.startsWith('bank-')?'bank_payment':'stuck_transaction',summary:report.label,reference:row.bankOrderId||row.providerReference||row.billReference||row.txHash||row.eventId,
        transactionKey,transaction,reportReason:report.reason,customer,createdAt:now,updatedAt:now,
        messages:[{id:crypto.randomUUID(),author:'user',text:report.label+' - '+report.description,createdAt:now},
          {id:crypto.randomUUID(),author:'agent',text:'Transaction report received for manual review. Reference: '+(transaction.providerReference||transaction.transactionHash||transaction.eventId)+'. Recorded status: '+transaction.status+'. '+transaction.amountUsdc+' USDC'+(transaction.amountNgn?' / NGN '+transaction.amountNgn:'')+'. Network: '+transaction.network+'.',createdAt:now,kind:'transaction_report'}]}
      let saved=item,reused=false
      await mutateDurableJson<SupportStore>(STORE_KEY,current=>{const next=current||{cases:{}};const result=upsertTransactionReport(next.cases,item);saved=result.item;reused=result.reused;return next})
      return res.status(reused?200:201).json({ok:true,case:publicCase(saved),reused})
    }
    if (action === 'reply') {
      const caseId = clean(req.body?.caseId, 80)
      const text = clean(req.body?.message, 1500)
      if (!text) return res.status(400).json({ ok: false, error: 'Reply is required.' })
      let saved: SupportCase | undefined
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next = current || { cases: {} }
        const item = next.cases[caseId]
        if (!item || item.profileId !== profileId) throw Object.assign(new Error('Support case not found.'), { status: 404 })
        const now = Date.now()
        item.messages = [...item.messages, { id: crypto.randomUUID(), author: 'user', text, createdAt: now }]
        item.status = item.assignedTo ? 'assigned' : 'open'
        item.waitingSince = undefined
        item.reminderSentAt = undefined
        item.resolvedAt = undefined
        item.updatedAt = now
        saved = item
        return next
      })
      return res.json({ ok: true, case: saved && publicCase(saved) })
    }
    if (action === 'mark-read') {
      const caseId = clean(req.body?.caseId, 80)
      let saved: SupportCase | undefined
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next = current || { cases: {} }
        const item = next.cases[caseId]
        if (!item || item.profileId !== profileId) throw Object.assign(new Error('Support case not found.'), { status: 404 })
        item.customerReadAt = Date.now()
        saved = item
        return next
      })
      return res.json({ ok: true, case: saved && publicCase(saved) })
    }

    const category = clean(req.body?.category, 40) as SupportCase['category']
    const summary = clean(req.body?.summary, 800)
    if (!summary) return res.status(400).json({ ok: false, error: 'Support summary is required.' })
    const entrypoint = clean(req.body?.entrypoint, 40)
    if (entrypoint === 'human_chat') {
      const existing = Object.values((await currentStore()).cases)
        .filter(row => row.profileId === profileId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (existing && existing.status !== 'resolved') return res.json({ ok: true, case: publicCase(existing), reused: true })
      if (existing) {
        let reopened: SupportCase | undefined
        await mutateDurableJson<SupportStore>(STORE_KEY, current => {
          const next = current || { cases: {} }
          const item = next.cases[existing.id]
          if (!item || item.profileId !== profileId) return next
          item.status = item.assignedTo ? 'assigned' : 'open'
          item.waitingSince = undefined
          item.reminderSentAt = undefined
          item.resolvedAt = undefined
          item.updatedAt = Date.now()
          reopened = item
          return next
        })
        if (reopened) return res.json({ ok: true, case: publicCase(reopened), reused: true, reopened: true })
      }
    }
    const now = Date.now()
    const customer = await privateCustomerIdentity(identity)
    const item: SupportCase = {
      id: 'pcs_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), profileId, status: 'open',
      category: ['bank_identity', 'bank_payment', 'stuck_transaction', 'account'].includes(category) ? category : 'other',
      priority: req.body?.priority === 'high' ? 'high' : 'normal', summary, reference: clean(req.body?.reference, 160) || undefined,
      customer,
      messages: Array.isArray(req.body?.messages) ? req.body.messages.slice(-16).map((row: any) => ({ id: crypto.randomUUID(), author: row.author === 'user' ? 'user' : 'agent', text: clean(row.text, 1200), createdAt: now })) : [],
      createdAt: now, updatedAt: now,
    }
    await mutateDurableJson<SupportStore>(STORE_KEY, current => ({ ...current, cases: { ...(current?.cases || {}), [item.id]: item } }))
    const commitmentSecret = (process.env.OG_MEMORY_COMMITMENT_SECRET || process.env.DEVELOPER_PORTAL_SECRET || '').trim()
    if (commitmentSecret) {
      const supportCommitment = crypto.createHmac('sha256', commitmentSecret).update(item.id).update(summary).digest('hex')
      void archivePayment({ eventId: 'support-' + crypto.randomBytes(12).toString('hex'), txHash: 'support_' + supportCommitment, chain: '0G Support Proof', payer: 'private-pocket-support', amount: '0', ts: now, source: 'pocket-support', metadata: { type: 'pocket_support_case_commitment', commitment: supportCommitment, privacy: 'non_correlatable_content_hash_only' } }).then(async proof => {
        if (!proof) return
        await mutateDurableJson<SupportStore>(STORE_KEY, current => { const next = current || { cases: {} }; const found = next.cases[item.id]; if (found) found.proof = { ...proof, ogExplorer: 'https://chainscan.0g.ai/tx/' + proof.ogTxHash }; return next })
      }).catch(error => console.warn('[pocket-support] background 0G commitment failed.', error instanceof Error ? error.message : String(error)))
    }
    return res.status(201).json({ ok: true, case: publicCase(item) })
  } catch (error) {
    const status = Number((error as any)?.status) || circlePocketIdentityErrorStatus(error, 500)
    return res.status(status).json({ ok: false, error: error instanceof Error ? error.message : 'Support request failed.' })
  }
}

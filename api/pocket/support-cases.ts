import {boundedSupportRead} from './support-read-budget.js'
import {readSupportBalance,readSupportBillStatus} from './support-diagnostics.js'
import {checkSupportIncomingUsdc} from './support-investigation-chain.js'
import {supportActions,type SupportActionId} from '../../src/pocket/lib/pocketSupportActions.js'
import {routeSupportIntent} from '../hash-support/intent-router.js'
import {supportAccountAnswer} from './support-account-answer.js'
import {readSupportPayments,readSupportPayoutStatus} from './support-account-data.js'
import {POCKET_SUPPORT_HANDOFF_TEXT} from '../../src/pocket/lib/pocketSupportContent.js'
import {matchSupportQuestion} from '../hash-support/semantic-answer.js'
import { createKnowledge, reviewKnowledge, POCKET_SUPPORT_TENANT, type KnowledgeStore } from '../hash-support/knowledge.js'
import {readPocketKycLevel} from './kyc-level.js'
import { submitSupportConversation } from './support-conversation.js'
import { pocketActivityStore } from './activity-store.js'
import { activityFeedKey } from './activity-feed.js'
import { reportTransaction, transactionReportKey, transactionReportDetails, validateTransactionReport, upsertTransactionReport } from './transaction-report.js'
import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { PrivyClient, type User } from '@privy-io/server-auth'
import { archivePayment } from '../og-storage.js'
import { hasRenderDurableStore } from '../render-durable-store.js'
import {mutateSupportJson as mutateDurableJson,readSupportJson as readDurableJson} from '../hash-support/pocket-storage.js'
import { circlePocketIdentityErrorStatus, circlePocketIdentityId, resolveCirclePocketIdentity } from '../circle-pocket-identity.js'
import { localCurrencyProfileRepository } from '../local-currency-profile.js'
import { advancePocketSupportLifecycle, requestSupportResolution, answerSupportResolution, supportSystemMessage, type PocketSupportLifecycleMessage } from './support-case-lifecycle.js'

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
  customer?: { fullName: string; email: string; pocketId: string; kycReference?:string; kycLevel?:string }
  messages: SupportMessage[]
  proof?: { rootHash: string; ogTxHash: string; ogExplorer: string }
  createdAt: number
  updatedAt: number
  resolutionRequestedAt?: number
  resolutionPromptId?: string
  supportEscalatedAt?: number
  waitingSince?: number
  reminderSentAt?: number
  resolvedAt?: number
  customerReadAt?: number
}
type SupportStore = { knowledge?: KnowledgeStore; cases: Record<string, SupportCase>; staffNames?: Record<string, string>; staffImages?: Record<string,string> }

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
    (message.author === 'staff' || message.kind === 'automatic_reminder' || message.kind === 'automatic_resolution' || message.kind === 'resolution_prompt' || message.kind === 'staff_joined')
    && message.createdAt > lastReadAt
  )).length
  const messages = safe.messages.map(message => message.author==='agent' && message.text==="I can�t answer that reliably yet. I�ve passed your question to Pocket Support." ? {...message,text:POCKET_SUPPORT_HANDOFF_TEXT} : message)
  return { ...safe, messages, humanSupport: Boolean(item.humanSupport || item.assignedTo || item.category !== 'other' || item.messages.some(m => m.author === 'staff' || m.kind === 'transaction_report')), unreadCount }
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
  const kyc=await readPocketKycLevel(identity.subject)
  return { fullName, kycReference:kyc.reference,kycLevel:kyc.level,email: clean(profile.email, 240).toLowerCase(), pocketId: clean(profile.pocketId || profile.pocketNumber, 20) }
}

export default async function pocketSupportCasesHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    const action = clean(req.body?.action || req.query.action, 40) || (req.method === 'GET' ? 'list-mine' : 'create')
    if (action.startsWith('staff-')) {
      const staff = await verifiedStaff(req)
      if (action.startsWith('staff-knowledge-')) {
        if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST for knowledge actions.'})
        if(action==='staff-knowledge-list')return res.json({ok:true,knowledge:Object.values((await store()).knowledge||{}).filter(item=>item.tenantId===POCKET_SUPPORT_TENANT)})
        if(!['staff-knowledge-draft','staff-knowledge-approve','staff-knowledge-retire'].includes(action))return res.status(400).json({ok:false,error:'Unknown knowledge action.'})
        let entry
        await mutateDurableJson<SupportStore>(STORE_KEY,current=>{
          const next=current||{cases:{}};const entries=next.knowledge||={};const now=Date.now()
          if(action==='staff-knowledge-draft'){
            const source=next.cases[clean(req.body?.caseId,80)]
            if(!source||source.status!=='resolved')throw Object.assign(new Error('Choose a resolved case before drafting a reusable answer.'),{status:409})
            const privateValues=[source.customer?.fullName,source.customer?.email,source.customer?.pocketId,source.customer?.kycReference,source.reference,source.transaction?.eventId,source.transaction?.transactionHash,source.transaction?.receiptId,source.transaction?.providerReference,source.transaction?.payer,source.transaction?.recipient].filter((value):value is string=>typeof value==='string')
            entry=createKnowledge(entries,{tenantId:POCKET_SUPPORT_TENANT,actorId:staff.userId,id:'hkn_'+crypto.randomUUID(),sourceCaseId:source.id,question:req.body?.question,answer:req.body?.answer,privateValues},now)
          }else entry=reviewKnowledge(entries,{tenantId:POCKET_SUPPORT_TENANT,actorId:staff.userId,id:clean(req.body?.id,80),version:Number(req.body?.version),action:action==='staff-knowledge-approve'?'approve':'retire',reviewConfirmed:req.body?.reviewConfirmed===true},now)
          return next
        })
        return res.json({ok:true,entry})
      }
      if (action === 'staff-profile') {
        const displayName = clean(req.body?.displayName, 60)
        if (!displayName) return res.status(400).json({ok:false,error:'Enter your support display name.'})
        const image=String(req.body?.avatarDataUrl || '')
        if(image && (image.length>16000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(image))) return res.status(400).json({ok:false,error:'Choose a small PNG, JPEG or WebP profile image.'})
        await mutateDurableJson<SupportStore>(STORE_KEY, current => ({...current, cases:current?.cases || {}, staffNames:{...current?.staffNames,[staff.userId]:displayName},staffImages:{...current?.staffImages,[staff.userId]:image}}))
        return res.json({ok:true,displayName})
      }
      if (!['staff-list','staff-reply','staff-assign','staff-resolve'].includes(action)) return res.status(400).json({ok:false,error:'Unknown support action.'})
      if (action === 'staff-list') {
        const rows = Object.values((await currentStore()).cases).sort((a, b) => b.updatedAt - a.updatedAt)
        return res.json({ ok: true, cases: rows, displayName: (await store()).staffNames?.[staff.userId] || '', avatarDataUrl:(await store()).staffImages?.[staff.userId] || '' })
      }
      const caseId = clean(req.body?.caseId, 80)
      let saved: SupportCase | undefined
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next = current || { cases: {} }
        const item = next.cases[caseId]
        if (!item) throw Object.assign(new Error('Support case not found.'), { status: 404 })
        const now = Date.now()
        if (item.status === 'resolved') throw Object.assign(new Error('This conversation is closed.'), {status:409})
        if (item.assignedTo !== staff.email) supportSystemMessage(item, 'staff_joined', (next.staffNames?.[staff.userId] || 'Pocket Support') + ' joined the conversation.', now, () => crypto.randomUUID())
        if (action === 'staff-reply') {
          const text = clean(req.body?.message, 1500)
          if (!text) throw Object.assign(new Error('Reply is required.'), { status: 400 })
          item.messages = [...item.messages, { id: crypto.randomUUID(), author: 'staff', displayName: next.staffNames?.[staff.userId] || 'Pocket Support', avatarDataUrl:next.staffImages?.[staff.userId] || undefined, text, createdAt: now }]
          item.resolutionRequestedAt = undefined; item.resolutionPromptId = undefined
          item.status = 'waiting_user'
          item.waitingSince = req.body?.resolve === true ? undefined : now
          item.reminderSentAt = undefined
          item.resolvedAt = undefined
          if (req.body?.resolve === true) requestSupportResolution(item, now, () => crypto.randomUUID())
        } else if (action === 'staff-assign') {
          item.resolutionRequestedAt = undefined; item.resolutionPromptId = undefined
          item.status = 'assigned'
          item.waitingSince = undefined
          item.reminderSentAt = undefined
          item.resolvedAt = undefined
        } else if (action === 'staff-resolve') {
          requestSupportResolution(item, now, () => crypto.randomUUID())
        }
        item.supportEscalatedAt = undefined
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
      const current = await currentStore()
      const rows = Object.values(current.cases).filter(item => item.profileId === profileId).sort((a, b) => b.updatedAt - a.updatedAt)
      const team = Object.entries(current.staffNames || {}).slice(0,3).map(([id,displayName])=>({displayName,avatarDataUrl:current.staffImages?.[id]||undefined}))
      return res.json({ ok: true, cases: rows.map(publicCase), team })
    }
    if (action === 'resolution-answer') {
      if (!['yes','no'].includes(req.body?.answer)) return res.status(400).json({ok:false,error:'Choose Yes or No.'})
      let saved: SupportCase | undefined
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next=current || {cases:{}}
        const item=next.cases[clean(req.body?.caseId,80)]
        if(!item || item.profileId!==profileId) throw Object.assign(new Error('Support case not found.'),{status:404})
        advancePocketSupportLifecycle({item},Date.now(),()=>crypto.randomUUID())
        answerSupportResolution(item,clean(req.body?.promptId,80),req.body.answer,Date.now(),()=>crypto.randomUUID())
        saved=item;return next
      })
      return res.json({ok:true,case:saved && publicCase(saved)})
    }
    if (action === 'chat') {
      if (identity.kind !== 'privy') return res.status(401).json({ok:false,error:'Sign in to Pocket to contact Support.'})
      let saved: SupportCase | undefined
      const optionId=req.body?.optionId as SupportActionId|undefined
      if(optionId!==undefined&&(typeof optionId!=='string'||!Object.prototype.hasOwnProperty.call(supportActions,optionId)))return res.status(400).json({ok:false,error:'Choose an available support option.'})
      if(optionId==='payment_details'&&(!req.body?.eventId||typeof req.body.eventId!=='string'||req.body.eventId.length>250))return res.status(400).json({ok:false,error:'Choose a payment from the list.'})
      const message=optionId?supportActions[optionId].message:String(req.body?.message||'').trim()
      const customer = await privateCustomerIdentity(identity)
      const snapshot=await store()
      let accountAnswer=await supportAccountAnswer({identity,profileId,selectedEventId:optionId==='payment_details'?clean(req.body?.eventId,250):undefined,question:message,requestId:clean(req.body?.requestId,80),caseId:clean(req.body?.caseId,80)||undefined,newConversation:req.body?.newConversation===true,cases:snapshot.cases},{profile:async()=>customer?{resolvedName:customer.fullName}:undefined,payments:readSupportPayments,chainCheck:(owner,network,hash)=>boundedSupportRead(owner+':tx:'+network+':'+hash,()=>checkSupportIncomingUsdc(owner,network,hash)),payoutStatus:row=>boundedSupportRead(identity.subject+':bank:'+row.eventId,()=>readSupportPayoutStatus(row)),balanceCheck:(owner,network,asset)=>boundedSupportRead(owner+':balance:'+network+':'+asset,()=>readSupportBalance(owner,network,asset)),billStatus:(owner,row)=>boundedSupportRead(owner+':bill:'+row.eventId,()=>readSupportBillStatus(owner,row))})
      if(!accountAnswer&&!optionId){
        const intent=await routeSupportIntent({profileId,message,requestId:clean(req.body?.requestId,80),caseId:clean(req.body?.caseId,80)||undefined,newConversation:req.body?.newConversation===true,cases:snapshot.cases,privateValues:[customer?.fullName,customer?.email,customer?.pocketId,customer?.kycReference].filter((v):v is string=>Boolean(v))})
        if(intent)accountAnswer=await supportAccountAnswer({identity,profileId,question:intent==='selected_payment'?'What is its status?':supportActions[intent].message,requestId:clean(req.body?.requestId,80),caseId:clean(req.body?.caseId,80)||undefined,newConversation:req.body?.newConversation===true,cases:snapshot.cases},{profile:async()=>customer?{resolvedName:customer.fullName}:undefined,payments:readSupportPayments,chainCheck:(owner,network,hash)=>boundedSupportRead(owner+':tx:'+network+':'+hash,()=>checkSupportIncomingUsdc(owner,network,hash)),payoutStatus:row=>boundedSupportRead(identity.subject+':bank:'+row.eventId,()=>readSupportPayoutStatus(row)),balanceCheck:(owner,network,asset)=>boundedSupportRead(owner+':balance:'+network+':'+asset,()=>readSupportBalance(owner,network,asset)),billStatus:(owner,row)=>boundedSupportRead(owner+':bill:'+row.eventId,()=>readSupportBillStatus(owner,row))})
      }
      const match=accountAnswer||optionId?undefined:await matchSupportQuestion({profileId,message:String(req.body?.message||'').trim(),requestId:clean(req.body?.requestId,80),caseId:clean(req.body?.caseId,80)||undefined,newConversation:req.body?.newConversation===true,cases:snapshot.cases,entries:snapshot.knowledge||{},tenantId:POCKET_SUPPORT_TENANT,privateValues:[customer?.fullName,customer?.email,customer?.pocketId,customer?.kycReference].filter((v):v is string=>Boolean(v))})
      await mutateDurableJson<SupportStore>(STORE_KEY, current => {
        const next = current || {cases:{}}
        advancePocketSupportLifecycle(next.cases, Date.now(), () => crypto.randomUUID())
        saved = submitSupportConversation(next.cases, {profileId,caseId:clean(req.body?.caseId,80)||undefined,newConversation:req.body?.newConversation===true,message,optionId,requestId:clean(req.body?.requestId,80)}, Date.now(), () => crypto.randomUUID(), {tenantId:POCKET_SUPPORT_TENANT,entries:next.knowledge||{},match,accountAnswer})
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
          {id:crypto.randomUUID(),author:'agent',text:'Transaction report received for manual review. Reference: '+(transaction.providerReference||transaction.transactionHash||transaction.eventId)+'. Recorded status: '+transaction.status+'. '+transaction.amountUsdc+' USDC'+(transaction.amountNgn?' / '+(row.fiatCurrency==='UGX'?'UGX':'NGN')+' '+transaction.amountNgn:'')+'. Network: '+transaction.network+'.',createdAt:now,kind:'transaction_report'}]}
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
        if (item.status === 'resolved') throw Object.assign(new Error('This conversation is closed. Start a new message.'), {status:409})
        item.resolutionRequestedAt = undefined; item.resolutionPromptId = undefined; item.supportEscalatedAt = undefined
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
      const existing = Object.values((await currentStore()).cases).filter(row => row.profileId === profileId && row.status !== 'resolved').sort((a,b)=>b.updatedAt-a.updatedAt)[0]
      if(existing) return res.json({ok:true,case:publicCase(existing),reused:true})
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

export function startPocketSupportLifecycle() {
  let running=false
  const timer=setInterval(async()=>{
    if(running || !hasRenderDurableStore())return
    running=true
    try{await currentStore()}catch{console.warn('[pocket-support] Lifecycle refresh failed; will retry.')}finally{running=false}
  },60_000)
  timer.unref()
  return ()=>clearInterval(timer)
}

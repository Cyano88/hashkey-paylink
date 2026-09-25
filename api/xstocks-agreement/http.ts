import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { assertLiveDeveloperRequest } from '../developer-environment.js'
import { getAddress, keccak256, stringToHex } from 'viem'
import { resolveDeveloperApiKeyPolicy, resolveXStocksAgreementProjectEnabled } from '../developer-projects.js'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from '../render-durable-store.js'
import { parseWorkPayment, prepareWorkBinding, prepareWorkAction, workPaymentAssets, workXLayerEnabled, type WorkTermsForBinding } from './work.js'
import { verifyAgreementPrivyWallet } from './wallet.js'
import { agreementPrivyAuthority } from './authority.js'
import { parseTradeCheckout, prepareTradeCheckoutBinding, tradeCheckoutEnvironment } from './trade.js'
import { TRADE_ACTION_LABELS, type TradeXLayerAction, type TradeXLayerStatus } from '../../src/lib/xstocksAgreement/protocol.js'

type Role = 'customer' | 'provider'
type Acceptance = { address: `0x${string}`; at: string }
export type XStocksAgreementRecord = {
  id: string; partnerId: string; walletAppId: string; digest: string; terms: WorkTermsForBinding
  participants: Record<Role, string>; accepted: Partial<Record<Role, Acceptance>>
  binding?: ReturnType<typeof prepareWorkBinding>
  stockReceipt?: TradeXLayerStatus['stockReceipt']
  observed?: Pick<TradeXLayerStatus, 'observedBlock' | 'state' | 'escrow'>
  evidence: Array<{ hash: string; body: string; role: Role; at: string }>
  events: Array<{ type: string; at: string; role?: Role; state?: number; block?: string }>
  createdAt: string
}
type Deps = {
  env: () => NodeJS.ProcessEnv; hasStore: () => boolean; now: () => Date
  policy: typeof resolveDeveloperApiKeyPolicy
  projectEnabled: (partnerId: string) => Promise<boolean>
  identity: (req: Request, env: NodeJS.ProcessEnv) => Promise<string>
  wallet: typeof verifyAgreementPrivyWallet; plan: typeof prepareWorkAction; assets: typeof workPaymentAssets
  read: (key: string) => Promise<XStocksAgreementRecord | undefined>
  mutate: (key: string, update: (record: XStocksAgreementRecord | undefined) => XStocksAgreementRecord) => Promise<XStocksAgreementRecord>
}
function fail(status: number, message: string): never { throw Object.assign(new Error(message), { status }) }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const key = (id: string) => `hashpaylink:xstocks-agreement:v1:${id}`
function id(value: unknown) {
  if (typeof value !== 'string' || !/^xag_[a-f0-9]{64}$/.test(value)) fail(400, 'A valid Agreement ID is required.')
  return value as string
}
function field(value: unknown, name: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `Enter a valid ${name}.`)
  return (value as string).trim()
}
async function identity(req: Request, env: NodeJS.ProcessEnv) {
  const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID
  const secret = env.PRIVY_APP_SECRET
  if (!appId || !secret) fail(503, 'Authentication is unavailable.')
  const token = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || req.headers['x-api-key']) fail(401, 'Sign in with your participant account.')
  try { return (await new PrivyClient(appId!, secret!).verifyAuthToken(token!)).userId }
  catch { return fail(401, 'Your participant session is invalid or expired.') }
}
const defaults: Deps = {
  env: () => process.env, hasStore: hasRenderDurableStore, now: () => new Date(),
  policy: resolveDeveloperApiKeyPolicy, projectEnabled: resolveXStocksAgreementProjectEnabled,
  identity, wallet: verifyAgreementPrivyWallet, plan: prepareWorkAction, assets: workPaymentAssets,
  read: readDurableJson, mutate: mutateDurableJson,
}
function roleFor(record: XStocksAgreementRecord, userId: string): Role {
  if (record.participants.customer === userId) return 'customer'
  if (record.participants.provider === userId) return 'provider'
  return fail(404, 'Agreement not found.')
}
function view(record: XStocksAgreementRecord) {
  return { id: record.id, projectId: record.partnerId, walletAppId: record.walletAppId, checkoutPath: `/agreements/xstocks/${record.id}`, terms: record.terms, consentHash: record.digest,
    accepted: record.accepted, binding: record.binding, observed: record.observed, stockReceipt:record.stockReceipt,
    evidence: record.evidence, events: record.events, createdAt: record.createdAt }
}
function responseError(res: Response, error: unknown) {
  const status = Number((error as { status?: number })?.status) || 500
  return res.status(status).json({ ok: false, error: status >= 500 ? 'Agreement service is temporarily unavailable.' : (error as Error).message })
}
const startActions = new Set(['create', 'accept', 'approve', 'fund'])

export function createXStocksAgreementHandlers(overrides: Partial<Deps> = {}) {
  const d = { ...defaults, ...overrides }
  const developer = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (!['GET', 'POST'].includes(req.method)) fail(405, 'Method not allowed.')
      assertLiveDeveloperRequest(req)
      if (!d.hasStore()) fail(503, 'Durable storage is unavailable.')
      const policy = await d.policy(req)
      if (!policy || policy.environment !== 'live' || policy.checkoutMode !== 'human'
        || !policy.capabilities.includes('xstocks_agreements')) fail(403, 'An xStocks Agreement project key is required.')
      if (req.method === 'GET' && req.query.purpose === 'assets') {
        return res.json({ ok: true, ...await d.assets(req.query.kind === 'trade' ? tradeCheckoutEnvironment(d.env(), policy.partnerId) : d.env()) })
      }
      if (req.method === 'GET') {
        const lookup = req.query.idempotencyKey
        if (lookup !== undefined && (typeof lookup !== 'string' || !/^[a-zA-Z0-9:_-]{16,128}$/.test(lookup))) fail(400, 'Invalid idempotency key.')
        const record = await d.read(key(id(lookup ? 'xag_' + hash(JSON.stringify([policy.partnerId, lookup])) : req.query.id)))
        if (!record || record.partnerId !== policy.partnerId) fail(404, 'Agreement not found.')
        return res.json({ ok: true, agreement: view(record!) })
      }
      if (req.body?.action !== undefined) fail(400, 'Developer keys may create drafts only.')
      if ((req.body?.paymentRail !== undefined && req.body.paymentRail !== 'xlayer')
        || (req.body?.network !== undefined && req.body.network !== 'xlayer')
        || (req.body?.checkoutMode !== undefined && req.body.checkoutMode !== 'human')) fail(400, 'This route supports human xStocks Agreements on X Layer only.')
      const paymentEnv = req.body?.kind === 'trade' ? tradeCheckoutEnvironment(d.env(), policy.partnerId) : d.env()
      if (!workXLayerEnabled(paymentEnv)) fail(409, 'New xStocks Agreements are paused.')
      const authority = agreementPrivyAuthority(d.env())
      const replayKey = field(req.headers['idempotency-key'], 'idempotency key', 128)
      if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(replayKey)) fail(400, 'Use a 16-128 character idempotency key.')
      const customer = field(req.body?.customerUserId, 'customer account', 150)
      const provider = field(req.body?.providerUserId, 'provider account', 150)
      if (!/^did:privy:[a-zA-Z0-9_-]+$/.test(customer) || !/^did:privy:[a-zA-Z0-9_-]+$/.test(provider) || customer === provider) fail(400, 'Choose two distinct Privy participants.')
      if (req.body?.kind !== undefined && req.body.kind !== 'trade') fail(400, 'Unsupported Agreement kind.')
      const amount = field(req.body?.amount, 'stock quantity', 100)
      const durationSeconds = req.body?.durationSeconds
      const terms: WorkTermsForBinding = req.body?.kind === 'trade' ? parseTradeCheckout(req.body, paymentEnv) : { version: 1, title: field(req.body?.title, 'title', 160),
        description: field(req.body?.description, 'work description', 4000), amount, durationSeconds,
        xlayerPayment: parseWorkPayment({ ...req.body, paymentRail: 'xlayer' }, amount, durationSeconds, d.env()) }
      const agreementId = 'xag_' + hash(JSON.stringify([policy.partnerId, replayKey]))
      const participants = { customer, provider }
      const digest = hash(JSON.stringify({ partnerId: policy.partnerId, walletAppId: authority.appId, terms, participants }))
      const at = d.now().toISOString()
      const record = await d.mutate(key(agreementId), current => {
        if (current) {
          if (current.partnerId !== policy.partnerId || current.digest !== digest) fail(409, 'Idempotency key already used with different terms.')
          return current
        }
        if(terms.kind==='trade'&&!terms.stockCustody)fail(400,'New Trade drafts require explicit xstocks-shares-v2 custody.')
        return { id: agreementId, partnerId: policy.partnerId, walletAppId: authority.appId, digest, terms, participants, accepted: {},
          evidence: [], events: [{ type: 'draft_created', at }], createdAt: at }
      })
      return res.status(201).json({ ok: true, agreement: view(record) })
    } catch (error) { return responseError(res, error) }
  }
  const participant = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (req.method !== 'POST') fail(405, 'Method not allowed.')
      assertLiveDeveloperRequest(req)
      if (!d.hasStore()) fail(503, 'Durable storage is unavailable.')
      const agreementId = id(req.body?.agreementId)
      let record = await d.read(key(agreementId))
      if (!record) fail(404, 'Agreement not found.')
      const authority = agreementPrivyAuthority(d.env())
      if (record!.walletAppId !== authority.appId) fail(409, 'The Agreement wallet app changed. Contact support.')
      const userId = await d.identity(req, authority.env)
      const role = roleFor(record!, userId)
      const action = req.body?.action
      if (!['read', 'accept_terms', 'prepare'].includes(action)) fail(400, 'Choose a supported participant action.')
      const env: NodeJS.ProcessEnv = record!.terms.kind === 'trade' ? tradeCheckoutEnvironment(authority.env, record!.partnerId) : { ...authority.env }
      if (!await d.projectEnabled(record!.partnerId)) env.HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED = 'false'
      const fundingEnabled = workXLayerEnabled(env)&&(!record!.terms.stockCustody||env.HASHPAYLINK_XSTOCKS_SHARE_ENABLED==='true')
      if (action === 'read') return res.json({ ok: true, role, fundingEnabled, agreement: view(record!) })
      if (action === 'accept_terms') {
        if (!workXLayerEnabled(env)) fail(409, 'New xStocks Agreements are paused.')
        if (req.body?.consentHash !== record!.digest) fail(409, 'Review and accept the exact Agreement terms.')
        const wallet = await d.wallet(userId, req.body?.address, env)
        const at = d.now().toISOString()
        record = await d.mutate(key(agreementId), current => {
          if (!current || current.digest !== record!.digest) fail(409, 'Agreement changed. Refresh.')
          const currentRole = roleFor(current!, userId)
          const accepted = current!.accepted[currentRole]
          if (accepted && accepted.address !== wallet.address) fail(409, 'The accepted wallet cannot change.')
          if (accepted) return current!
          const other = currentRole === 'customer' ? 'provider' : 'customer'
          if (current!.accepted[other]?.address === wallet.address) fail(409, 'Participants must use distinct wallets.')
          current!.accepted[currentRole] = { address: wallet.address, at }
          current!.events.push({ type: 'terms_accepted', role: currentRole, at })
          if (current!.accepted.customer && current!.accepted.provider) {
            current!.binding = (current!.terms.kind === 'trade' ? prepareTradeCheckoutBinding : prepareWorkBinding)(current!.id, current!.terms,
              current!.accepted.customer.address, current!.accepted.provider.address, Math.floor(d.now().getTime() / 1000))
          }
          return current!
        })
        return res.json({ ok: true, role, fundingEnabled, agreement: view(record) })
      }
      if (!record!.binding || !record!.accepted[role]) fail(409, 'Both participants must accept the terms first.')
      const operation = req.body?.operation as TradeXLayerAction | undefined
      if (operation !== undefined && (typeof operation !== 'string' || !Object.prototype.hasOwnProperty.call(TRADE_ACTION_LABELS, operation))) fail(400, 'Unsupported escrow operation.')
      if (operation && startActions.has(operation) && !workXLayerEnabled(env)) fail(409, 'New xStocks payments are paused.')
      const wallet = await d.wallet(userId, record!.accepted[role]!.address, env)
      if (getAddress(wallet.address) !== record!.accepted[role]!.address) fail(403, 'The accepted wallet does not match.')
      // Re-plan if another participant advances the saved block while RPC is
      // reading. Never return signing data from a rejected chain observation.
      let status: Awaited<ReturnType<Deps['plan']>>
      for (let attempt = 0; ; attempt++) {
        status = await d.plan({ env, binding: record!.binding!, account: wallet.address, action: operation, evidence: req.body?.evidence })
        try {
          // Persist evidence and monotonic confirmed state before returning any signing data.
          record = await d.mutate(key(agreementId), current => {
            if (!current || current.digest !== record!.digest || current.binding?.termsHash !== record!.binding?.termsHash) fail(409, 'Agreement changed. Refresh.')
            roleFor(current!, userId)
            const at = d.now().toISOString()
            if (!status.pending && current!.observed?.state !== undefined && status.state === undefined) {
              fail(409, 'The known escrow is missing from the confirmed chain view. Refresh.')
            }
            if (operation && ['dispatch', 'refund', 'dispute'].includes(operation)) {
              const body = field(req.body?.evidence, 'evidence', 2000)
              if (body.length < 10) fail(400, 'Add evidence of at least 10 characters.')
              const digest = keccak256(stringToHex(body))
              if (!current!.evidence.some(note => note.hash === digest && note.role === role)) {
                if (current!.evidence.length >= 128) fail(409, 'Evidence limit reached. Contact support.')
                current!.evidence.push({ hash: digest, body, role, at })
              }
            }
            if (!status.pending && status.observedBlock && status.state !== undefined) {
              const previous = current!.observed
              if (!previous?.observedBlock || BigInt(status.observedBlock) > BigInt(previous.observedBlock)) {
                current!.stockReceipt = status.stockReceipt
                current!.observed = { observedBlock: status.observedBlock, state: status.state, escrow: status.escrow }
                if (previous?.state !== status.state) current!.events.push({ type: 'chain_state', state: status.state, block: status.observedBlock, at })
              } else if (BigInt(status.observedBlock) < BigInt(previous.observedBlock) || status.state !== previous.state) throw Object.assign(new Error('Payment details are updating. Please try again.'), {status:409, code:'STALE_CHAIN_OBSERVATION'})
            }
            return current!
          })
          break
        } catch (error) {
          if ((error as {code?:string}).code !== 'STALE_CHAIN_OBSERVATION' || attempt >= 2) throw error
        }
      }
      return res.json({ ok: true, role, fundingEnabled, agreement: view(record), status })
    } catch (error) { return responseError(res, error) }
  }
  return { developer, participant }
}

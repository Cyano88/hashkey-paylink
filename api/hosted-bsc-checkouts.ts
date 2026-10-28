import type { Request, Response } from 'express'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { formatUnits, parseUnits, isAddress } from 'viem'
import { mutateWithDeveloperActivity } from './developer-activity-store.js'
import { hasRenderDurableStore, readDurableJson } from './render-durable-store.js'
import { dispatchDeveloperWebhook, resolveBscCheckoutProjectEnabled, type DeveloperCheckoutPolicy } from './developer-projects.js'
import { assertLiveDeveloperRequest } from './developer-environment.js'
import { resolveHostedCheckoutPartnerPolicy } from './hosted-checkouts.js'
import { paymentExecutionRepository } from './pocket/payment-execution-intents.js'
import { paymentAssetAmount, paymentToken, type PaymentToken } from './pocket/payment-asset.js'
import {createBscRuntime} from './pocket/bsc-runtime.js'

import { isBscCheckoutAsset, bscCheckoutAssets } from '../src/lib/bscCheckoutConfig.js'

const KEY = 'hashpaylink:hosted-bsc-checkouts:v1'
export const isBscCheckoutId = (id: unknown): id is string => typeof id === 'string' && /^chkb_[a-f0-9]{24}$/.test(id)
export type BscCheckout = {
  id: string; partnerId: string; ownerId: string; environment: 'live'; network: 'bsc'; checkoutMode: 'human'
  title: string; merchantName: string; brandImageUrl?: string; amount: string; asset: string; token: PaymentToken; recipient: string
  notionalUsd: string; returnUrl: string; swapEnabled: boolean; createdAt: string; expiresAt: string; requestHash: string
  integrity: string
  payment?: { status: 'paid'; txHash: string; payer: string; amount: string; network: 'bsc'; confirmedAt: string; receiptId: string }
}
type Notice = { checkoutId: string; attempts: number; nextAttemptAt: number; delivered?: boolean; leaseUntil?: number }
type Store = { checkouts: Record<string, BscCheckout>; idempotency: Record<string, string>; outbox: Record<string, Notice> }
const normalized = (s?: Store): Store => ({ checkouts: s?.checkouts ?? {}, idempotency: s?.idempotency ?? {}, outbox: s?.outbox ?? {} })
function fail(message: string, status = 400): never { throw Object.assign(Error(message), { status }) }
function isProjectPolicy(value:unknown):value is DeveloperCheckoutPolicy {return Boolean(value&&typeof value==='object'&&'projectManaged' in value&&value.projectManaged===true)}
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const defaults = {
  enabled: (projectId:string) => process.env.HASHPAYLINK_BSC_CHECKOUT_ENABLED === 'true' && (process.env.HASHPAYLINK_BSC_CHECKOUT_PROJECTS||'').split(',').map(s=>s.trim()).includes(projectId),
  secret: () => process.env.HOSTED_CHECKOUT_SIGNING_SECRET || '',
  hasStore: hasRenderDurableStore,
  read: async () => normalized(await readDurableJson<Store>(KEY)),
  mutate: (fn: (s: Store) => Store) => mutateWithDeveloperActivity<Store>('checkout', KEY, s => fn(normalized(s))),
  policy: resolveHostedCheckoutPartnerPolicy,
  asset: async (address:string)=>{
    const runtime=createBscRuntime(),token=bscCheckoutAssets.find(t=>t.address.toLowerCase()===address.toLowerCase())
    if(!token||await runtime.chainId()!==56)fail('BNB Chain could not be verified.',503)
    if(BigInt(await runtime.rpc('eth_call',[{to:token.address,data:'0x313ce567'},'latest']))!==18n)fail('Token decimals could not be verified.',503)
    return {chainId:56 as const,address:token.address,symbol:token.symbol,decimals:18}
  },
  price:async(address:string)=>{const t=bscCheckoutAssets.find(t=>t.address.toLowerCase()===address.toLowerCase());if(!t)fail('Unsupported asset.');return Number((await createBscRuntime().readPrices())[t.symbol].scaled8)/1e8},
  executions: paymentExecutionRepository,
  notify: dispatchDeveloperWebhook,
  now: Date.now,
  id: () => 'chkb_' + randomUUID().replace(/-/g, '').slice(0, 24),
}
type Dependencies = typeof defaults
function signature(r: Omit<BscCheckout,'integrity'>, secret:string) {
 return createHmac('sha256',secret).update(JSON.stringify([r.id,r.partnerId,r.ownerId,r.environment,r.network,r.checkoutMode,r.title,r.merchantName,r.amount,r.asset,r.token.chainId,r.token.address,r.token.symbol,r.token.decimals,r.recipient,r.notionalUsd,r.returnUrl,r.swapEnabled,r.createdAt,r.expiresAt,r.requestHash,...(r.brandImageUrl!==undefined?[r.brandImageUrl]:[])])).digest('hex')
}
function valid(r:BscCheckout,d:Dependencies){const secret=d.secret();return secret.length>=32&&/^[a-f0-9]{64}$/.test(r.integrity)&&timingSafeEqual(Buffer.from(r.integrity),Buffer.from(signature(r,secret)))}
export async function readBscCheckout(id: string, allowExpired = false, d: Dependencies = defaults) {
  if (!isBscCheckoutId(id) || !d.hasStore()) return null
  const record = (await d.read()).checkouts[id]
  if (!record || !valid(record,d) || (!allowExpired && !record.payment && Date.parse(record.expiresAt) <= d.now())) return null
  return record
}
const response = (r: BscCheckout) => ({ ok: true, checkoutId: r.id, checkoutUrl: '/pay/c/' + r.id, paymentUrl: '/pay/c/' + r.id + '?browser=1',
  checkout: { id: r.id, title: r.title, merchantName: r.merchantName, brandImageUrl:r.brandImageUrl, amount: r.amount, asset: r.asset, token: r.token, network: 'bsc', bscCheckout: true, status: r.payment?.status ?? 'pending', expiresAt: r.expiresAt, swapEnabled: false },
})

export function createHostedBscCheckoutsHandler(overrides: Partial<Dependencies> = {}) {
  const d = { ...defaults, ...overrides }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      assertLiveDeveloperRequest(req)
      if (!d.hasStore()) fail('Checkout storage is unavailable.', 503)
      if (req.method === 'GET') {
        const r = await readBscCheckout(String(req.query.id), true, d)
        if (!r) fail('Checkout not found.', 404)
        if (req.query.purpose === 'status') {
          const policy = await d.policy(req)
          if (!isProjectPolicy(policy) || policy.environment !== 'live' || policy.partnerId !== r.partnerId) fail('Valid project credentials are required.', 403)
          return res.json({ ...response(r), status: r.payment ? 'paid' : Date.parse(r.expiresAt) <= d.now() ? 'expired' : 'pending', ...(r.payment ? { payment: r.payment } : {}) })
        }
        if (!r.payment && !isBscCheckoutAsset(r.token.address)) fail('This checkout asset is no longer accepted. Ask the business for a stablecoin payment link.', 409)
        if (!r.payment && Date.parse(r.expiresAt) <= d.now()) return res.status(410).json({ok:false,error:'Checkout expired.',merchantName:r.merchantName,brandImageUrl:r.brandImageUrl,...(req.query.purpose==='return'?{returnUrl:r.returnUrl}:{})})
        return res.json({ ...response(r), ...(req.query.purpose==='return'?{returnUrl:r.returnUrl}:{}), ...(r.payment ? { returnUrl: r.returnUrl, payment:r.payment, recipient:r.recipient } : {}) })
      }
      if (req.method !== 'POST') return res.sendStatus(405)
      const policy = await d.policy(req)
      if (!isProjectPolicy(policy) || policy.environment !== 'live' || policy.checkoutMode !== 'human'
        || !policy.capabilities.includes('hosted_checkout') || !policy.ownerId) fail('A live human Checkout project is required.', 403)
      const p = policy as DeveloperCheckoutPolicy
      if(req.body?.kind!==undefined&&!['payment','service','usdc_request'].includes(req.body.kind))fail('Unsupported checkout kind.')
      if (!p.bscCheckout || p.settlementMode !== 'usdc') fail('Configure BNB Chain asset acceptance in your project first.', 409)
      if (req.body?.flexible || req.body?.providerFunding || req.body?.agenticType || (req.body?.checkoutMode && req.body.checkoutMode !== 'human')) fail('BNB Chain checkout requires a fixed human payment; funding is not supported.')
      if (req.body?.recipient !== undefined || req.body?.paymentOptions !== undefined || req.body?.network !== undefined) fail('Payment routing is managed in the developer dashboard.')
      const key = String(req.headers['idempotency-key'] ?? '')
      if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(key)) fail('A valid Idempotency-Key header is required.')
      if (typeof req.body?.asset !== 'string' || typeof req.body?.amount !== 'string') fail('Asset and exact token amount must be strings.')
      const assetInput = clean(req.body?.asset, 80)
      const chosen = bscCheckoutAssets.find(a => a.address.toLowerCase() === assetInput.toLowerCase() || a.symbol === assetInput)
      if (!chosen) fail('Checkout accepts supported stablecoins only. Choose an enabled stablecoin on BNB Chain.')
      if (!p.bscCheckout.assets.includes(chosen.address.toLowerCase())) fail('Choose a stablecoin accepted by this project.')
      const amountInput = clean(req.body?.amount, 100), title = clean(req.body?.title, 100) || 'Payment request'
      const returnUrl = clean(req.body?.returnUrl, 300)
      if (returnUrl) { let origin = ''; try { origin = new URL(returnUrl).origin } catch {} if (!p.allowedOrigins.includes(origin)) fail('Return URL is not allowlisted for this project.') }
      const swapEnabled = req.body?.swap === true
      if (req.body?.swap !== undefined && typeof req.body.swap !== 'boolean') fail('Swap must be true or false.')
      if (swapEnabled) fail('Swap in Pocket before paying. Checkout accepts a supported stablecoin balance.', 400)
      const expiresInMinutes = Number(req.body?.expiresInMinutes ?? 15)
      if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 5 || expiresInMinutes > 1440) fail('Expiry must be between 5 and 1440 minutes.')
      const requestHash = createHash('sha256').update(JSON.stringify([amountInput, chosen.address.toLowerCase(), p.bscCheckout.recipient, title, returnUrl, swapEnabled, expiresInMinutes])).digest('hex')
      const scopedKey = p.partnerId + ':' + key, before = await d.read(), existing = before.checkouts[before.idempotency[scopedKey]]
      if (existing) { if (!valid(existing,d) || existing.requestHash !== requestHash) fail('Idempotency key is already bound to another checkout.', 409); await ensureBscCheckoutExecution(existing,d); return res.json({ ...response(existing), replayed: true }) }
      if (!d.enabled(p.partnerId)) fail('BNB Chain checkout is awaiting release activation.', 503)
      if(d.secret().length<32)fail('Checkout signing is unavailable.',503)
      const token = paymentToken(await d.asset(chosen.address.toLowerCase()),'bsc','bsc')!, amount = paymentAssetAmount(amountInput, token)
      const price = await d.price(chosen.address.toLowerCase())
      if (!price || !Number.isFinite(price) || price <= 0) fail('A fresh asset price is unavailable.', 503)
      const divisor = 10n ** BigInt(token.decimals + 12)
      const notionalUnits = (parseUnits(amount, token.decimals) * parseUnits(price.toFixed(18), 18) + divisor - 1n) / divisor
      if (notionalUnits <= 0n || notionalUnits > 100_000n * 1_000_000n) fail('Checkout value must be between 0.000001 and 100,000 USD.')
      const now = d.now()
      let record: BscCheckout = { id: d.id(), partnerId: p.partnerId, ownerId: p.ownerId!, environment: 'live', network: 'bsc', checkoutMode: 'human', title,
        merchantName: p.merchantName, ...(p.brandImageUrl?{brandImageUrl:p.brandImageUrl}:{}), amount, token, asset: token.symbol, recipient: p.bscCheckout.recipient, notionalUsd: formatUnits(notionalUnits, 6),
        returnUrl, swapEnabled, createdAt: new Date(Math.floor(now/1000)*1000).toISOString(), expiresAt: new Date(now + expiresInMinutes * 60_000).toISOString(), requestHash, integrity:'' }
      record.integrity=signature(record,d.secret())
      await d.mutate(s => {
        const existing = s.checkouts[s.idempotency[scopedKey]]
        if (existing) { if (!valid(existing,d) || existing.requestHash !== requestHash) fail('Idempotency key conflict.', 409); record = existing; return s }
        if (Object.keys(s.checkouts).length >= 20_000) fail('Checkout capacity reached.', 503)
        const used = Object.values(s.checkouts).filter(r => r.partnerId === p.partnerId && (r.payment ? Date.parse(r.payment.confirmedAt)>now-86_400_000 : Date.parse(r.createdAt)>now-86_400_000&&Date.parse(r.expiresAt)>now)).reduce((sum, r) => sum + parseUnits(r.notionalUsd, 6), 0n)
        if (used + notionalUnits > 500_000n * 1_000_000n) fail('Daily BNB Chain checkout capacity reached.', 409)
        s.checkouts[record.id] = record; s.idempotency[scopedKey] = record.id; return s
      })
      await ensureBscCheckoutExecution(record, d)
      return res.status(201).json(response(record))
    } catch (error) { const e = error as Error & { status?: number }; return res.status(e.status ?? 503).json({ ok: false, error: e.status ? e.message : 'BNB checkout is temporarily unavailable.' }) }
  }
}

async function ensureBscCheckoutExecution(r: BscCheckout, d: Dependencies) {
  const result = await d.executions.create({ ownerId: 'partner:' + r.partnerId, idempotencyKey: 'hosted-bsc:' + r.id, kind: 'hosted_checkout', amount: r.amount, token: r.token, sourceNetwork: 'bsc', settlementNetwork: 'bsc', destinationType: 'partner_checkout', metadata: { checkoutId: r.id, merchantName: r.merchantName } })
  return result.intent.resourceId ? result.intent : d.executions.update({ ownerId: result.intent.ownerId, intentId: result.intent.id, resourceId: r.id })
}

/** Internal entry point: only call after the shared XPay engine verifies the transfer. */
export async function settleBscCheckout(input: { id: string; token: string; units: string; recipient: string; payer: string; hash: string; confirmedAt: string; paymentId: string }, d: Dependencies = defaults) {
  if (!isAddress(input.payer) || !/^[1-9][0-9]*$/.test(input.units)) fail('BNB payment does not match checkout.', 409)
  let record: BscCheckout | undefined
  await d.mutate(s => {
    const r = s.checkouts[input.id]
    if (!r || !valid(r,d) || !/^0x[a-f0-9]{64}$/.test(input.hash) || input.token.toLowerCase() !== r.token.address.toLowerCase() || input.recipient.toLowerCase() !== r.recipient.toLowerCase() || BigInt(input.units) !== parseUnits(r.amount, r.token.decimals)) fail('BNB payment does not match checkout.', 409)
    const at = Date.parse(input.confirmedAt)
    if (!Number.isFinite(at) || at < Date.parse(r.createdAt) || at > d.now()+5000) fail('Payment is outside the checkout window.', 409)
    if (r.payment && r.payment.txHash !== input.hash) fail('Checkout already paid.', 409)
    if (Object.values(s.checkouts).some(other => other.id !== r.id && other.payment?.txHash === input.hash)) fail('Transfer already used.', 409)
    r.payment ??= { status: 'paid', txHash: input.hash, payer: input.payer, amount: r.amount, network: 'bsc', confirmedAt: input.confirmedAt, receiptId: input.paymentId }
    s.outbox[r.id] ??= { checkoutId: r.id, attempts: 0, nextAttemptAt: d.now() }
    record = r; return s
  })
  let intent = await ensureBscCheckoutExecution(record!, d)
  for (const state of ['authorized', 'submitted', 'completed'] as const) {
    if (intent.state === 'completed') break
    if ((state === 'authorized' && intent.state !== 'prepared') || (state === 'submitted' && intent.state !== 'authorized')) continue
    intent = await d.executions.update({ ownerId: intent.ownerId, intentId: intent.id, state, transactionHash: input.hash })
  }
  return record!
}

export async function drainBscCheckoutWebhooks(d: Dependencies = defaults) {
  if (!d.hasStore()) return
  for (const notice of Object.values((await d.read()).outbox).filter(n => !n.delivered && n.nextAttemptAt <= d.now() && (!n.leaseUntil || n.leaseUntil <= d.now())).slice(0, 20)) {
    let record: BscCheckout | undefined
    await d.mutate(s => { const n = s.outbox[notice.checkoutId]; if (!n || n.delivered || (n.leaseUntil ?? 0) > d.now()) return s; n.leaseUntil = d.now() + 60_000; n.attempts++; record = s.checkouts[n.checkoutId]; return s })
    if (!record?.payment || !valid(record,d)) continue
    let sent = false
    try { const result = await d.notify(record.partnerId, 'payment.confirmed', { checkoutId: record.id, status: 'paid', network: 'bsc', asset: record.asset, token: record.token.address, amount: record.amount, payer: record.payment.payer, transactionHash: record.payment.txHash, confirmedAt: record.payment.confirmedAt }, { eventId: 'bsc-paid:' + record.id, createdAt: record.payment.confirmedAt }); sent = result.status === 'sent' } catch {}
    await d.mutate(s => { const n = s.outbox[notice.checkoutId]; n.delivered = sent; n.leaseUntil = undefined; n.nextAttemptAt = d.now() + Math.min(3_600_000, 10_000 * 2 ** Math.min(n.attempts, 8)); return s })
  }
}
export default createHostedBscCheckoutsHandler()

export async function assertBscCheckoutPayable(r:BscCheckout,swap=false){
 if(!isBscCheckoutAsset(r.token.address))fail('This checkout asset is no longer accepted. Ask the business for a stablecoin payment link.',409)
 if(swap)fail('Swap in Pocket before paying.',403)
 if(!defaults.enabled(r.partnerId)||r.payment||Date.parse(r.expiresAt)<=Date.now()||!await resolveBscCheckoutProjectEnabled(r.partnerId,r.recipient,r.token.address))fail('This checkout is not accepting new payments.',409)
 if(swap&&!r.swapEnabled)fail('Swap is not enabled for this checkout.',403)
}

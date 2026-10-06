import type { Request, Response } from 'express'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { formatUnits, parseUnits, isAddress } from 'viem'
import { mutateWithDeveloperActivity } from './developer-activity-store.js'
import { hasRenderDurableStore, readDurableJson } from './render-durable-store.js'
import { dispatchDeveloperWebhook, resolveStockCheckoutProjectEnabled, type DeveloperCheckoutPolicy } from './developer-projects.js'
import { assertLiveDeveloperRequest } from './developer-environment.js'
import { resolveHostedCheckoutPartnerPolicy } from './hosted-checkouts.js'
import { paymentExecutionRepository } from './pocket/payment-execution-intents.js'
import { paymentAssetAmount, paymentToken, type PaymentToken } from './pocket/payment-asset.js'
import { stockNoticeAsset, stockNoticeClient } from './pocket/xstocks-notifications-store.js'
import { readStockMarketPrices } from './pocket/xstocks-prices.js'
import { xlayerCheckoutAssets } from '../src/lib/xlayerCheckoutConfig.js'

const KEY = 'hashpaylink:hosted-stock-checkouts:v1'
export const isStockCheckoutId = (id: unknown): id is string => typeof id === 'string' && /^chkx_[a-f0-9]{24}$/.test(id)
export type StockCheckout = {
  id: string; partnerId: string; ownerId: string; environment: 'live'; network: 'xlayer'; checkoutMode: 'human'
  title: string; merchantName: string; amount: string; asset: string; token: PaymentToken; recipient: string
  notionalUsd: string; returnUrl: string; swapEnabled: boolean; createdAt: string; expiresAt: string; requestHash: string
  integrity: string
  payment?: { status: 'paid'; txHash: string; payer: string; amount: string; network: 'xlayer'; confirmedAt: string; receiptId: string }
}
type Notice = { checkoutId: string; attempts: number; nextAttemptAt: number; delivered?: boolean; leaseUntil?: number }
type Store = { checkouts: Record<string, StockCheckout>; idempotency: Record<string, string>; outbox: Record<string, Notice> }
const normalized = (s?: Store): Store => ({ checkouts: s?.checkouts ?? {}, idempotency: s?.idempotency ?? {}, outbox: s?.outbox ?? {} })
function fail(message: string, status = 400): never { throw Object.assign(Error(message), { status }) }
function isProjectPolicy(value:unknown):value is DeveloperCheckoutPolicy {return Boolean(value&&typeof value==='object'&&'projectManaged' in value&&value.projectManaged===true)}
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const defaults = {
  enabled: (projectId:string) => process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_ENABLED === 'true' && (process.env.HASHPAYLINK_XSTOCKS_CHECKOUT_PROJECTS||'').split(',').map(s=>s.trim()).includes(projectId),
  secret: () => process.env.HOSTED_CHECKOUT_SIGNING_SECRET || '',
  hasStore: hasRenderDurableStore,
  read: async () => normalized(await readDurableJson<Store>(KEY)),
  mutate: (fn: (s: Store) => Store) => mutateWithDeveloperActivity<Store>('checkout', KEY, s => fn(normalized(s))),
  policy: resolveHostedCheckoutPartnerPolicy,
  asset: async (address: string) => {
    if (await stockNoticeClient.getChainId() !== 196) fail('X Layer could not be verified.', 503)
    const asset = await stockNoticeAsset(address)
    return { chainId: 196 as const, address: asset.address, symbol: asset.symbol, decimals: asset.decimals }
  },
  price: async (address: string) => (await readStockMarketPrices([address]))[address]?.usd,
  executions: paymentExecutionRepository,
  notify: dispatchDeveloperWebhook,
  now: Date.now,
  id: () => 'chkx_' + randomUUID().replace(/-/g, '').slice(0, 24),
}
type Dependencies = typeof defaults
function signature(r: Omit<StockCheckout,'integrity'>, secret:string) {
 return createHmac('sha256',secret).update(JSON.stringify([r.id,r.partnerId,r.ownerId,r.environment,r.network,r.checkoutMode,r.title,r.merchantName,r.amount,r.asset,r.token.chainId,r.token.address,r.token.symbol,r.token.decimals,r.recipient,r.notionalUsd,r.returnUrl,r.swapEnabled,r.createdAt,r.expiresAt,r.requestHash])).digest('hex')
}
function valid(r:StockCheckout,d:Dependencies){const secret=d.secret();return secret.length>=32&&/^[a-f0-9]{64}$/.test(r.integrity)&&timingSafeEqual(Buffer.from(r.integrity),Buffer.from(signature(r,secret)))}
export async function readStockCheckout(id: string, allowExpired = false, d: Dependencies = defaults) {
  if (!isStockCheckoutId(id) || !d.hasStore()) return null
  const record = (await d.read()).checkouts[id]
  if (!record || !valid(record,d) || (!allowExpired && !record.payment && Date.parse(record.expiresAt) <= d.now())) return null
  return record
}
const response = (r: StockCheckout) => ({ ok: true, checkoutId: r.id, checkoutUrl: '/pay/c/' + r.id, paymentUrl: '/xpay/' + r.id,
  checkout: { id: r.id, title: r.title, merchantName: r.merchantName, amount: r.amount, asset: r.asset, token: r.token, network: 'xlayer', stockCheckout: true, status: r.payment?.status ?? 'pending', expiresAt: r.expiresAt, swapEnabled: r.swapEnabled },
})

export function createHostedStockCheckoutsHandler(overrides: Partial<Dependencies> = {}) {
  const d = { ...defaults, ...overrides }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      assertLiveDeveloperRequest(req)
      if (!d.hasStore()) fail('Checkout storage is unavailable.', 503)
      if (req.method === 'GET') {
        const r = await readStockCheckout(String(req.query.id), true, d)
        if (!r) fail('Checkout not found.', 404)
        if (req.query.purpose === 'status') {
          const policy = await d.policy(req)
          if (!isProjectPolicy(policy) || policy.environment !== 'live' || policy.partnerId !== r.partnerId) fail('Valid project credentials are required.', 403)
          return res.json({ ...response(r), status: r.payment ? 'paid' : Date.parse(r.expiresAt) <= d.now() ? 'expired' : 'pending', ...(r.payment ? { payment: r.payment } : {}) })
        }
        if (!r.payment && Date.parse(r.expiresAt) <= d.now()) fail('Checkout expired.', 410)
        return res.json({ ...response(r), ...(r.payment ? { returnUrl: r.returnUrl, payment:r.payment, recipient:r.recipient } : {}) })
      }
      if (req.method !== 'POST') return res.sendStatus(405)
      const policy = await d.policy(req)
      if (!isProjectPolicy(policy) || policy.environment !== 'live' || policy.checkoutMode !== 'human'
        || !policy.capabilities.includes('hosted_checkout') || !policy.ownerId) fail('A live human Checkout project is required.', 403)
      const p = policy as DeveloperCheckoutPolicy
      if(req.body?.kind!==undefined&&!['payment','service','usdc_request'].includes(req.body.kind))fail('Unsupported checkout kind.')
      if (!p.xlayerCheckout || p.settlementMode !== 'usdc') fail('Configure X Layer asset acceptance in your project first.', 409)
      if (req.body?.flexible || req.body?.providerFunding || req.body?.agenticType || (req.body?.checkoutMode && req.body.checkoutMode !== 'human')) fail('X Layer checkout requires a fixed human payment; funding is not supported.')
      if (req.body?.recipient !== undefined || req.body?.paymentOptions !== undefined || req.body?.network !== undefined) fail('Payment routing is managed in the developer dashboard.')
      const key = String(req.headers['idempotency-key'] ?? '')
      if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(key)) fail('A valid Idempotency-Key header is required.')
      if (typeof req.body?.asset !== 'string' || typeof req.body?.amount !== 'string') fail('Asset and exact token amount must be strings.')
      const assetInput = clean(req.body?.asset, 80)
      const chosen = xlayerCheckoutAssets.find(a => a.address.toLowerCase() === assetInput.toLowerCase() || a.symbol === assetInput)
      if (!chosen || !p.xlayerCheckout.assets.includes(chosen.address.toLowerCase())) fail('Choose an asset accepted by this project.')
      const amountInput = clean(req.body?.amount, 100), title = clean(req.body?.title, 100) || 'Payment request'
      const returnUrl = clean(req.body?.returnUrl, 300)
      if (returnUrl) { let origin = ''; try { origin = new URL(returnUrl).origin } catch {} if (!p.allowedOrigins.includes(origin)) fail('Return URL is not allowlisted for this project.') }
      const swapEnabled = req.body?.swap === true
      if (req.body?.swap !== undefined && typeof req.body.swap !== 'boolean') fail('Swap must be true or false.')
      if (swapEnabled && (!p.swapPermission || !p.capabilities.includes('swap_xlayer'))) fail('Swap requires wallet:swap permission and X Layer Swap enabled.', 403)
      const expiresInMinutes = Number(req.body?.expiresInMinutes ?? 30)
      if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 5 || expiresInMinutes > 1440) fail('Expiry must be between 5 and 1440 minutes.')
      const requestHash = createHash('sha256').update(JSON.stringify([amountInput, chosen.address.toLowerCase(), p.xlayerCheckout.recipient, title, returnUrl, swapEnabled, expiresInMinutes])).digest('hex')
      const scopedKey = p.partnerId + ':' + key, before = await d.read(), existing = before.checkouts[before.idempotency[scopedKey]]
      if (existing) { if (!valid(existing,d) || existing.requestHash !== requestHash) fail('Idempotency key is already bound to another checkout.', 409); await ensureStockCheckoutExecution(existing,d); return res.json({ ...response(existing), replayed: true }) }
      if (!d.enabled(p.partnerId)) fail('X Layer checkout is awaiting release activation.', 503)
      if(d.secret().length<32)fail('Checkout signing is unavailable.',503)
      const token = paymentToken(await d.asset(chosen.address.toLowerCase()),'xlayer','xlayer')!, amount = paymentAssetAmount(amountInput, token)
      const price = await d.price(chosen.address.toLowerCase())
      if (!price || !Number.isFinite(price) || price <= 0) fail('A fresh asset price is unavailable.', 503)
      const divisor = 10n ** BigInt(token.decimals + 12)
      const notionalUnits = (parseUnits(amount, token.decimals) * parseUnits(price.toFixed(18), 18) + divisor - 1n) / divisor
      if (notionalUnits <= 0n || notionalUnits > 100_000n * 1_000_000n) fail('Checkout value must be between 0.000001 and 100,000 USD.')
      const now = d.now()
      let record: StockCheckout = { id: d.id(), partnerId: p.partnerId, ownerId: p.ownerId!, environment: 'live', network: 'xlayer', checkoutMode: 'human', title,
        merchantName: p.merchantName, amount, token, asset: token.symbol, recipient: p.xlayerCheckout.recipient, notionalUsd: formatUnits(notionalUnits, 6),
        returnUrl, swapEnabled, createdAt: new Date(Math.floor(now/1000)*1000).toISOString(), expiresAt: new Date(now + expiresInMinutes * 60_000).toISOString(), requestHash, integrity:'' }
      record.integrity=signature(record,d.secret())
      await d.mutate(s => {
        const existing = s.checkouts[s.idempotency[scopedKey]]
        if (existing) { if (!valid(existing,d) || existing.requestHash !== requestHash) fail('Idempotency key conflict.', 409); record = existing; return s }
        if (Object.keys(s.checkouts).length >= 20_000) fail('Checkout capacity reached.', 503)
        const used = Object.values(s.checkouts).filter(r => r.partnerId === p.partnerId && (r.payment ? Date.parse(r.payment.confirmedAt)>now-86_400_000 : Date.parse(r.createdAt)>now-86_400_000&&Date.parse(r.expiresAt)>now)).reduce((sum, r) => sum + parseUnits(r.notionalUsd, 6), 0n)
        if (used + notionalUnits > 500_000n * 1_000_000n) fail('Daily X Layer checkout capacity reached.', 409)
        s.checkouts[record.id] = record; s.idempotency[scopedKey] = record.id; return s
      })
      await ensureStockCheckoutExecution(record, d)
      return res.status(201).json(response(record))
    } catch (error) { const e = error as Error & { status?: number }; return res.status(e.status ?? 503).json({ ok: false, error: e.status ? e.message : 'Stock checkout is temporarily unavailable.' }) }
  }
}

async function ensureStockCheckoutExecution(r: StockCheckout, d: Dependencies) {
  const result = await d.executions.create({ ownerId: 'partner:' + r.partnerId, idempotencyKey: 'hosted-stock:' + r.id, kind: 'hosted_checkout', amount: r.amount, token: r.token, sourceNetwork: 'xlayer', settlementNetwork: 'xlayer', destinationType: 'partner_checkout', metadata: { checkoutId: r.id, merchantName: r.merchantName } })
  return result.intent.resourceId ? result.intent : d.executions.update({ ownerId: result.intent.ownerId, intentId: result.intent.id, resourceId: r.id })
}

/** Internal entry point: only call after the shared XPay engine verifies the transfer. */
export async function settleStockCheckout(input: { id: string; token: string; units: string; recipient: string; payer: string; hash: string; confirmedAt: string; paymentId: string }, d: Dependencies = defaults) {
  if (!isAddress(input.payer) || !/^[1-9][0-9]*$/.test(input.units)) fail('Stock payment does not match checkout.', 409)
  let record: StockCheckout | undefined
  await d.mutate(s => {
    const r = s.checkouts[input.id]
    if (!r || !valid(r,d) || !/^0x[a-f0-9]{64}$/.test(input.hash) || input.token.toLowerCase() !== r.token.address.toLowerCase() || input.recipient.toLowerCase() !== r.recipient.toLowerCase() || BigInt(input.units) !== parseUnits(r.amount, r.token.decimals)) fail('Stock payment does not match checkout.', 409)
    const at = Date.parse(input.confirmedAt)
    if (!Number.isFinite(at) || at < Date.parse(r.createdAt) || at > Date.parse(r.expiresAt)) fail('Payment is outside the checkout window.', 409)
    if (r.payment && r.payment.txHash !== input.hash) fail('Checkout already paid.', 409)
    if (Object.values(s.checkouts).some(other => other.id !== r.id && other.payment?.txHash === input.hash)) fail('Transfer already used.', 409)
    r.payment ??= { status: 'paid', txHash: input.hash, payer: input.payer, amount: r.amount, network: 'xlayer', confirmedAt: input.confirmedAt, receiptId: input.paymentId }
    s.outbox[r.id] ??= { checkoutId: r.id, attempts: 0, nextAttemptAt: d.now() }
    record = r; return s
  })
  let intent = await ensureStockCheckoutExecution(record!, d)
  for (const state of ['authorized', 'submitted', 'completed'] as const) {
    if (intent.state === 'completed') break
    if ((state === 'authorized' && intent.state !== 'prepared') || (state === 'submitted' && intent.state !== 'authorized')) continue
    intent = await d.executions.update({ ownerId: intent.ownerId, intentId: intent.id, state, transactionHash: input.hash })
  }
  return record!
}

export async function drainStockCheckoutWebhooks(d: Dependencies = defaults) {
  if (!d.hasStore()) return
  for (const notice of Object.values((await d.read()).outbox).filter(n => !n.delivered && n.nextAttemptAt <= d.now() && (!n.leaseUntil || n.leaseUntil <= d.now())).slice(0, 20)) {
    let record: StockCheckout | undefined
    await d.mutate(s => { const n = s.outbox[notice.checkoutId]; if (!n || n.delivered || (n.leaseUntil ?? 0) > d.now()) return s; n.leaseUntil = d.now() + 60_000; n.attempts++; record = s.checkouts[n.checkoutId]; return s })
    if (!record?.payment || !valid(record,d)) continue
    let sent = false
    try { const result = await d.notify(record.partnerId, 'payment.confirmed', { checkoutId: record.id, status: 'paid', network: 'xlayer', asset: record.asset, token: record.token.address, amount: record.amount, payer: record.payment.payer, transactionHash: record.payment.txHash, confirmedAt: record.payment.confirmedAt }, { eventId: 'stock-paid:' + record.id, createdAt: record.payment.confirmedAt }); sent = result.status === 'sent' } catch {}
    await d.mutate(s => { const n = s.outbox[notice.checkoutId]; n.delivered = sent; n.leaseUntil = undefined; n.nextAttemptAt = d.now() + Math.min(3_600_000, 10_000 * 2 ** Math.min(n.attempts, 8)); return s })
  }
}
export default createHostedStockCheckoutsHandler()

export async function assertStockCheckoutPayable(r:StockCheckout,swap=false){
 if(!defaults.enabled(r.partnerId)||r.payment||Date.parse(r.expiresAt)<=Date.now()||!await resolveStockCheckoutProjectEnabled(r.partnerId,r.recipient,r.token.address,swap))fail('This checkout is not accepting new payments.',409)
 if(swap&&!r.swapEnabled)fail('Swap is not enabled for this checkout.',403)
}

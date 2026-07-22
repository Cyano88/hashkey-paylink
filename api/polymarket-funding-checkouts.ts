import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAddress, isAddress } from 'viem'
import { resolveDeveloperApiKeyPolicy, type DeveloperCheckoutPolicy } from './developer-projects.js'
import { createDepositAddress, getDepositStatus, minimumUsdcFor } from './polymarket-bridge.js'
import { createProviderRoutedHostedCheckout, hostedCheckoutPaymentAttempt, readVerifiedHostedCheckoutRecord, type HostedCheckoutNetwork } from './hosted-checkouts.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'

const STORE_KEY = (process.env.POLYMARKET_FUNDING_CHECKOUT_STORE_KEY ?? 'hashpaylink:polymarket-funding-checkouts:v1').trim()
const NETWORKS = new Set<HostedCheckoutNetwork>(['base', 'arbitrum'])

type FundingRecord = {
  id: string
  checkoutId: string
  partnerId: string
  targetWallet: string
  depositAddress: string
  networks: HostedCheckoutNetwork[]
  amount: string
  returnUrl: string
  requestHash: string
  checkoutUrl: string
  paymentAttemptId: string
  expiresAt: string
  createdAt: string
  integrity: string
}
type FundingStore = { records: Record<string, FundingRecord>; idempotency: Record<string, string> }

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<FundingStore | undefined>
  mutate: (key: string, update: (current: FundingStore | undefined) => FundingStore) => Promise<FundingStore>
  policy: (req: Pick<Request, 'headers'>) => Promise<DeveloperCheckoutPolicy | null>
  createDeposit: typeof createDepositAddress
  bridgeStatus: typeof getDepositStatus
  createCheckout: typeof createProviderRoutedHostedCheckout
  readCheckout: typeof readVerifiedHostedCheckoutRecord
  signingSecret: () => string
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: (key, update) => mutateDurableJson<FundingStore>(key, update),
  policy: resolveDeveloperApiKeyPolicy,
  createDeposit: createDepositAddress,
  bridgeStatus: getDepositStatus,
  createCheckout: createProviderRoutedHostedCheckout,
  readCheckout: readVerifiedHostedCheckoutRecord,
  signingSecret: () => (process.env.HOSTED_CHECKOUT_SIGNING_SECRET ?? '').trim(),
  now: () => new Date(),
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function amount(value: unknown) {
  const text = clean(value, 40)
  return /^\d+(?:\.\d{1,6})?$/.test(text) && Number(text) > 0 ? text : ''
}

function origin(value: string) {
  try { return new URL(value).origin } catch { return '' }
}

function returnUrlWithFundingId(value: string, fundingId: string) {
  const url = new URL(value)
  url.searchParams.set('fundingRequestId', fundingId)
  return url.toString()
}

function requestedNetworks(value: unknown, policy: DeveloperCheckoutPolicy) {
  const allowed = new Set(policy.paymentOptions.map(option => option.network).filter(network => NETWORKS.has(network)))
  const requested = Array.isArray(value) ? value.map(item => clean(item, 20).toLowerCase()) : []
  const networks = (requested.length ? requested : [...allowed]).filter((item): item is HostedCheckoutNetwork => NETWORKS.has(item as HostedCheckoutNetwork) && allowed.has(item as HostedCheckoutNetwork))
  return Array.from(new Set(networks))
}

function unsigned(record: FundingRecord) {
  const { integrity: _integrity, ...value } = record
  return value
}

function sign(record: Omit<FundingRecord, 'integrity'>, secret: string) {
  return createHmac('sha256', secret).update(JSON.stringify([
    record.id, record.checkoutId, record.partnerId, record.targetWallet, record.depositAddress,
    record.networks, record.amount, record.returnUrl, record.requestHash, record.checkoutUrl,
    record.paymentAttemptId, record.expiresAt, record.createdAt,
  ])).digest('hex')
}

function valid(record: FundingRecord, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(record.integrity)) return false
  return timingSafeEqual(Buffer.from(sign(unsigned(record), secret), 'hex'), Buffer.from(record.integrity, 'hex'))
}

function publicRecord(record: FundingRecord, replayed = false) {
  return {
    ok: true,
    replayed,
    fundingRequestId: record.id,
    checkoutId: record.checkoutId,
    paymentAttemptId: record.paymentAttemptId,
    checkoutUrl: record.checkoutUrl,
    statusUrl: `/api/v2/funding/polymarket/checkouts?id=${encodeURIComponent(record.id)}`,
    expiresAt: record.expiresAt,
    funding: {
      provider: 'polymarket',
      targetWallet: record.targetWallet,
      amount: record.amount,
      availableNetworks: record.networks,
    },
  }
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string | number | readonly string[]>,
    body: undefined as any,
    setHeader(name: string, value: string | number | readonly string[]) { this.headers[name] = value; return this },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

function sendRecorded(res: Response, recorded: ReturnType<typeof responseRecorder>) {
  for (const [name, value] of Object.entries(recorded.headers)) res.setHeader(name, value)
  return res.status(recorded.statusCode).json(recorded.body)
}

export function createPolymarketFundingCheckoutsHandler(dependencies: Dependencies = defaults) {
  return async function polymarketFundingCheckoutsHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
      if (!dependencies.hasStore() || dependencies.signingSecret().length < 32) return res.status(503).json({ ok: false, error: 'Polymarket funding checkout is unavailable.' })
      const policy = await dependencies.policy(req)
      if (!policy) return res.status(401).json({ ok: false, error: 'Valid developer API credentials are required.' })
      if (!policy.capabilities.includes('polymarket_funding')) return res.status(403).json({ ok: false, error: 'Enable Polymarket funding for this developer project.' })
      if (policy.settlementMode !== 'usdc') return res.status(409).json({ ok: false, error: 'Polymarket funding requires a USDC developer project.' })

      const secret = dependencies.signingSecret()
      if (req.method === 'GET') {
        const id = clean(req.query?.id, 80)
        const store = await dependencies.read(STORE_KEY)
        const record = store?.records?.[id]
        if (!record || record.partnerId !== policy.partnerId || !valid(record, secret)) return res.status(404).json({ ok: false, error: 'Funding checkout not found.' })
        const checkout = await dependencies.readCheckout(record.checkoutId, { allowExpiredForReconciliation: true })
        if (!checkout || checkout.partnerId !== policy.partnerId) return res.status(409).json({ ok: false, error: 'Funding checkout verification failed.' })
        const bridge = await dependencies.bridgeStatus(record.depositAddress).catch(() => ({ transactions: [], latest: null }))
        const createdAt = Date.parse(record.createdAt)
        const transactions = bridge.transactions.filter(item => !item.createdTimeMs || item.createdTimeMs >= createdAt).sort((a, b) => (b.createdTimeMs ?? 0) - (a.createdTimeMs ?? 0))
        const completed = transactions.find(item => ['COMPLETE', 'COMPLETED'].includes(clean(item.status, 30).toUpperCase()))
        const latest = completed ?? transactions[0] ?? null
        const paymentStatus = checkout.payment?.status ?? (dependencies.now().getTime() >= Date.parse(checkout.expiresAt) ? 'expired' : 'pending')
        const fundingStatus = completed ? 'funded' : paymentStatus === 'paid' || paymentStatus === 'processing' ? 'bridging' : paymentStatus === 'expired' ? 'expired' : 'awaiting_payment'
        const attempt = hostedCheckoutPaymentAttempt(checkout)
        return res.json({
          ok: true,
          fundingRequestId: record.id,
          checkoutId: record.checkoutId,
          status: fundingStatus,
          paymentStatus,
          bridgeStatus: completed ? 'complete' : latest?.status ? clean(latest.status, 40).toLowerCase() : paymentStatus === 'paid' ? 'waiting' : 'not_started',
          network: checkout.payment?.network ?? attempt.network,
          paymentTransaction: checkout.payment?.txHash,
          bridgeTransaction: latest?.txHash,
          receiptUrl: completed ? attempt.receiptUrl : undefined,
          returnUrl: completed ? record.returnUrl : undefined,
          updatedAt: dependencies.now().toISOString(),
        })
      }

      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
      const idempotencyKey = clean(req.headers['idempotency-key'], 128)
      if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ ok: false, error: 'A valid Idempotency-Key header is required.' })
      const target = clean(req.body?.polymarketWallet, 64)
      const requestedAmount = amount(req.body?.amount)
      const requestedReturnUrl = clean(req.body?.returnUrl, 300)
      const networks = requestedNetworks(req.body?.networks, policy)
      if (!isAddress(target)) return res.status(400).json({ ok: false, error: 'Enter a valid Polymarket wallet.' })
      if (!requestedAmount || Number(requestedAmount) < minimumUsdcFor(networks[0] ?? 'base')) return res.status(400).json({ ok: false, error: 'Polymarket funding requires at least 3 USDC.' })
      if (!networks.length) return res.status(400).json({ ok: false, error: 'This live API key must enable Base or Arbitrum.' })
      if (!requestedReturnUrl || !policy.allowedOrigins.includes(origin(requestedReturnUrl))) return res.status(400).json({ ok: false, error: 'returnUrl origin is not allowlisted for this developer project.' })

      const normalizedTarget = getAddress(target)
      const fundingId = `pmf_${createHash('sha256').update(`${policy.partnerId}:${idempotencyKey}`).digest('hex').slice(0, 20)}`
      const returnUrl = returnUrlWithFundingId(requestedReturnUrl, fundingId)
      const requestHash = createHash('sha256').update(JSON.stringify([normalizedTarget, requestedAmount, networks, returnUrl])).digest('hex')
      const existing = (await dependencies.read(STORE_KEY))?.records?.[fundingId]
      if (existing) {
        if (!valid(existing, secret)) return res.status(409).json({ ok: false, error: 'Funding request integrity verification failed.' })
        if (existing.requestHash !== requestHash) return res.status(409).json({ ok: false, error: 'Idempotency-Key was already used for a different funding request.' })
        return res.json(publicRecord(existing, true))
      }

      const deposit = await dependencies.createDeposit(normalizedTarget, networks[0])
      if (deposit.addressType !== 'evm' || !isAddress(deposit.depositAddress)) return res.status(502).json({ ok: false, error: 'Polymarket did not return a verified EVM funding route.' })
      const recorded = responseRecorder()
      const originalBody = req.body
      req.body = {
        kind: 'service', checkoutMode: 'human', title: 'Fund Polymarket account',
        description: `Bridge USDC to ${normalizedTarget.slice(0, 6)}...${normalizedTarget.slice(-4)}.`,
        amount: requestedAmount, memo: 'Polymarket funding', returnUrl,
        defaultNetwork: networks[0], expiresInMinutes: Number(req.body?.expiresInMinutes ?? 60),
      }
      try {
        await dependencies.createCheckout(req, recorded as unknown as Response, {
          capability: 'polymarket_funding',
          defaultNetwork: networks[0],
          paymentOptions: networks.map(network => ({ network, recipient: getAddress(deposit.depositAddress) })),
          funding: { provider: 'polymarket', requestId: fundingId, targetWallet: normalizedTarget, depositAddress: getAddress(deposit.depositAddress) },
        })
      } finally {
        req.body = originalBody
      }
      if (recorded.statusCode < 200 || recorded.statusCode >= 300 || !recorded.body?.checkoutId) return sendRecorded(res, recorded)
      const createdAt = dependencies.now().toISOString()
      const unsignedRecord: Omit<FundingRecord, 'integrity'> = {
        id: fundingId, checkoutId: recorded.body.checkoutId, partnerId: policy.partnerId,
        targetWallet: normalizedTarget, depositAddress: getAddress(deposit.depositAddress), networks,
        amount: requestedAmount, returnUrl, requestHash, checkoutUrl: recorded.body.checkoutUrl,
        paymentAttemptId: recorded.body.paymentAttemptId, expiresAt: recorded.body.expiresAt, createdAt,
      }
      const record: FundingRecord = { ...unsignedRecord, integrity: sign(unsignedRecord, secret) }
      await dependencies.mutate(STORE_KEY, current => ({
        records: { ...(current?.records ?? {}), [fundingId]: record },
        idempotency: { ...(current?.idempotency ?? {}), [`${policy.partnerId}:${idempotencyKey}`]: fundingId },
      }))
      return res.status(recorded.statusCode).json(publicRecord(record, Boolean(recorded.body.replayed)))
    } catch (error) {
      console.error('[polymarket-funding-checkouts] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(503).json({ ok: false, error: 'Polymarket funding checkout is temporarily unavailable.' })
    }
  }
}

export default createPolymarketFundingCheckoutsHandler()

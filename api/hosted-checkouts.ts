import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { Request, Response } from 'express'
import { formatUnits, getAddress, isAddress } from 'viem'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'
import { dispatchDeveloperWebhook, prepareDeveloperNairaCheckout, resolveDeveloperApiKeyPolicy, type DeveloperCheckoutPolicy } from './developer-projects.js'

const STORE_KEY = (process.env.HOSTED_CHECKOUT_STORE_KEY ?? 'hashpaylink:hosted-checkouts:v2').trim()
const NETWORKS = new Set(['base', 'arbitrum', 'arc'])
const KINDS = new Set(['usdc_request', 'service'])
const CHECKOUT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
const MAX_CHECKOUT_RECORDS = 20_000
const WEBHOOK_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
const MAX_TERMINAL_WEBHOOK_EVENTS = 10_000
const WEBHOOK_LEASE_MS = 30_000
const WEBHOOK_MAX_ATTEMPTS = 12
const WEBHOOK_RETRY_DELAYS_MS = [10_000, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000]

export type HostedCheckoutNetwork = 'base' | 'arbitrum' | 'arc'
export type HostedCheckoutPaymentOption = { network: HostedCheckoutNetwork; recipient: string }
export type HostedCheckoutMode = 'human' | 'agentic'
export type HostedCheckoutAgenticType = 'creator_earnings' | 'agent_treasury'
type PartnerPolicy = { partnerId: string; allowedOrigins: string[] } | DeveloperCheckoutPolicy
type HostedCheckoutPayment = {
  status: 'processing' | 'paid' | 'failed'
  referenceType?: 'evm_tx_hash' | 'circle_gateway_transfer'
  txHash: string
  payer: string
  amount: string
  confirmedAt: string
  network?: HostedCheckoutNetwork
}
export type HostedCheckoutAgenticAttempt = {
  signatureHash: string
  nonce: string
  payer: string
  network: HostedCheckoutNetwork
  startedAt: string
}
export type HostedCheckoutPaymentAttempt = {
  id: string
  mode: HostedCheckoutMode
  status: 'pending' | 'processing' | 'paid' | 'failed'
  network?: HostedCheckoutNetwork
  recipient?: string
  returnUrl: string
  amount: string
  createdAt: string
  updatedAt: string
  referenceType?: 'evm_tx_hash' | 'circle_gateway_transfer'
  transaction?: string
  payer?: string
  confirmedAt?: string
  receiptId?: string
  receiptUrl?: string
}
type HostedCheckoutSettlement = {
  mode: 'ngn'
  provider: 'paycrest'
  orderId: string
  intentId: string
  requestedUsdc: string
  amountNgn: string
  bankName: string
  bankLast4: string
  accountName: string
}
export type CheckoutRecord = {
  id: string
  partnerId: string
  kind: 'usdc_request' | 'service'
  merchantName: string
  title: string
  description: string
  amount: string
  flexible: boolean
  network: HostedCheckoutNetwork
  recipient: string
  paymentOptions?: HostedCheckoutPaymentOption[]
  memo: string
  returnUrl: string
  createdAt: string
  expiresAt: string
  requestHash: string
  checkoutMode?: HostedCheckoutMode
  agenticType?: HostedCheckoutAgenticType
  settlement?: HostedCheckoutSettlement
  payout?: { status: string; deliveredAt?: string }
  integrity: string
  payment?: HostedCheckoutPayment
  paymentAttempts?: HostedCheckoutPaymentAttempt[]
  agenticAttempts?: HostedCheckoutAgenticAttempt[]
}
type HostedCheckoutAttemptRecord = Pick<CheckoutRecord, 'id' | 'createdAt' | 'checkoutMode' | 'network' | 'recipient' | 'paymentOptions' | 'returnUrl' | 'amount' | 'paymentAttempts'>
export type HostedCheckoutWebhookEvent = {
  id: string
  partnerId: string
  event: string
  data: Record<string, unknown>
  createdAt: string
  attempts: number
  nextAttemptAt: string
  status: 'pending' | 'delivering' | 'delivered' | 'dead'
  leaseUntil?: string
  deliveredAt?: string
  deadAt?: string
  lastError?: string
}
type CheckoutStore = { checkouts: Record<string, CheckoutRecord>; idempotency: Record<string, string>; outbox?: HostedCheckoutWebhookEvent[] }

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<CheckoutStore | undefined>
  mutate: (key: string, update: (current: CheckoutStore | undefined) => CheckoutStore) => Promise<CheckoutStore>
  policy: (req: Request) => PartnerPolicy | null | Promise<PartnerPolicy | null>
  notify: (partnerId: string, event: string, data: Record<string, unknown>, delivery?: { eventId: string; createdAt: string }) => Promise<void>
  prepareNaira: typeof prepareDeveloperNairaCheckout
  signingSecret: () => string
  createId: () => string
  now: () => Date
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parsePolicies(): Record<string, PartnerPolicy> {
  const raw = (process.env.HASH_PAYLINK_PARTNER_API_KEYS ?? '').trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, { partnerId?: unknown; allowedOrigins?: unknown }>
      return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => {
        const partnerId = clean(value?.partnerId, 64)
        const allowedOrigins = Array.isArray(value?.allowedOrigins)
          ? Array.from(new Set(value.allowedOrigins.map(item => normalizedOrigin(clean(item, 240))).filter(Boolean)))
          : []
        return key && partnerId ? [[key, { partnerId, allowedOrigins }]] : []
      }))
    } catch {
      return {}
    }
  }
  const single = (process.env.HASH_PAYLINK_PARTNER_API_KEY ?? '').trim()
  return single ? { [single]: { partnerId: 'private-beta', allowedOrigins: [] } } : {}
}

function resolveConfiguredPartnerPolicy(req: Pick<Request, 'headers'>) {
  const bearer = String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const apiKey = clean(req.headers['x-api-key'], 240) || bearer || ''
  const policies = parsePolicies()
  return apiKey && Object.prototype.hasOwnProperty.call(policies, apiKey) ? policies[apiKey] : null
}

export async function resolveHostedCheckoutPartnerPolicy(req: Pick<Request, 'headers'>) {
  return resolveConfiguredPartnerPolicy(req) ?? await resolveDeveloperApiKeyPolicy(req)
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: (key, update) => mutateDurableJson<CheckoutStore>(key, update),
  policy: resolveHostedCheckoutPartnerPolicy,
  notify: dispatchDeveloperWebhook,
  prepareNaira: prepareDeveloperNairaCheckout,
  signingSecret: () => (process.env.HOSTED_CHECKOUT_SIGNING_SECRET ?? '').trim(),
  createId: () => `chk_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
  now: () => new Date(),
}

function enqueueWebhook(store: CheckoutStore, partnerId: string, event: string, data: Record<string, unknown>, now: Date) {
  const createdAt = now.toISOString()
  const item: HostedCheckoutWebhookEvent = {
    id: `evt_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    partnerId,
    event,
    data,
    createdAt,
    attempts: 0,
    nextAttemptAt: createdAt,
    status: 'pending',
  }
  return { ...store, outbox: [...(store.outbox ?? []), item] }
}

export async function drainHostedCheckoutWebhookOutbox(dependencies: Dependencies = defaults, maxEvents = 10) {
  if (!dependencies.hasStore()) return 0
  let delivered = 0
  for (let index = 0; index < Math.max(0, Math.min(maxEvents, 100)); index += 1) {
    let claimed: HostedCheckoutWebhookEvent | undefined
    const claimedAt = dependencies.now()
    await dependencies.mutate(STORE_KEY, current => {
      const safe = current ?? { checkouts: {}, idempotency: {} }
      const nowMs = claimedAt.getTime()
      const candidate = (safe.outbox ?? []).find(item =>
        (item.status === 'pending' && Date.parse(item.nextAttemptAt) <= nowMs)
        || (item.status === 'delivering' && Date.parse(item.leaseUntil ?? '') <= nowMs)
      )
      if (!candidate) return safe
      claimed = {
        ...candidate,
        status: 'delivering',
        attempts: candidate.attempts + 1,
        leaseUntil: new Date(nowMs + WEBHOOK_LEASE_MS).toISOString(),
      }
      return { ...safe, outbox: (safe.outbox ?? []).map(item => item.id === candidate.id ? claimed! : item) }
    })
    if (!claimed) break

    let failure = ''
    try {
      await dependencies.notify(claimed.partnerId, claimed.event, claimed.data, { eventId: claimed.id, createdAt: claimed.createdAt })
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 240) : 'Webhook delivery failed.'
    }
    const completedAt = dependencies.now()
    await dependencies.mutate(STORE_KEY, current => {
      const safe = current ?? { checkouts: {}, idempotency: {} }
      return {
        ...safe,
        outbox: (safe.outbox ?? []).map(item => {
          if (item.id !== claimed!.id || item.status !== 'delivering') return item
          if (!failure) return { ...item, status: 'delivered' as const, deliveredAt: completedAt.toISOString(), leaseUntil: undefined, lastError: undefined }
          const dead = item.attempts >= WEBHOOK_MAX_ATTEMPTS
          const delay = WEBHOOK_RETRY_DELAYS_MS[Math.min(item.attempts - 1, WEBHOOK_RETRY_DELAYS_MS.length - 1)]
          return {
            ...item,
            status: dead ? 'dead' as const : 'pending' as const,
            nextAttemptAt: new Date(completedAt.getTime() + delay).toISOString(),
            leaseUntil: undefined,
            deadAt: dead ? completedAt.toISOString() : undefined,
            lastError: failure,
          }
        }),
      }
    })
    if (!failure) delivered += 1
  }
  return delivered
}

function startWebhookDrain(dependencies: Dependencies) {
  void drainHostedCheckoutWebhookOutbox(dependencies).catch(error => {
    console.error('[developer-webhook] outbox drain failed:', error instanceof Error ? error.message : String(error))
  })
}

function canonical(record: Omit<CheckoutRecord, 'integrity'>) {
  // JSONB does not preserve object key order. Sign a fixed field sequence so
  // verification remains stable after a durable Postgres round trip.
  const fields: unknown[] = [
    record.id,
    record.partnerId,
    record.kind,
    record.merchantName,
    record.title,
    record.description,
    record.amount,
    record.flexible,
    record.network,
    record.recipient,
    record.memo,
    record.returnUrl,
    record.createdAt,
    record.expiresAt,
    record.requestHash,
  ]
  // Keep the legacy single-network signature byte-for-byte stable. New
  // multi-network records append their immutable routing table.
  if (record.paymentOptions !== undefined) {
    fields.push(record.paymentOptions.map(option => [option.network, option.recipient]))
  }
  if (record.settlement !== undefined) {
    fields.push([
      record.settlement.mode,
      record.settlement.provider,
      record.settlement.orderId,
      record.settlement.intentId,
      record.settlement.requestedUsdc,
      record.settlement.amountNgn,
      record.settlement.bankName,
      record.settlement.bankLast4,
      record.settlement.accountName,
    ])
  }
  if (record.checkoutMode !== undefined) {
    fields.push(record.checkoutMode, record.agenticType ?? '')
  }
  return JSON.stringify(fields)
}

function sign(record: Omit<CheckoutRecord, 'integrity'>, secret: string) {
  return createHmac('sha256', secret).update(canonical(record)).digest('hex')
}

function integrityValid(record: CheckoutRecord, secret: string) {
  if (!validCheckoutRouting(record)) return false
  if (!/^[a-f0-9]{64}$/.test(record.integrity)) return false
  const { integrity, ...unsigned } = record
  const expected = sign(unsigned, secret)
  const actualBuffer = Buffer.from(integrity)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function hostedCheckoutMode(record: Pick<CheckoutRecord, 'checkoutMode'>): HostedCheckoutMode {
  // Records created before the forward-only contract were human-first. Keep
  // them readable without ever issuing a new mixed-mode checkout.
  return record.checkoutMode === 'agentic' ? 'agentic' : 'human'
}

function paymentAttemptId(record: Pick<CheckoutRecord, 'id' | 'createdAt'>) {
  return `pat_${createHash('sha256').update(`${record.id}:${record.createdAt}`).digest('hex').slice(0, 24)}`
}

function initialPaymentAttempt(record: Pick<CheckoutRecord, 'id' | 'createdAt' | 'checkoutMode' | 'network' | 'recipient' | 'paymentOptions' | 'returnUrl' | 'amount'>): HostedCheckoutPaymentAttempt {
  const mode = hostedCheckoutMode(record)
  const routeIsSelected = mode === 'agentic' || hostedCheckoutPaymentOptions(record).length === 1
  return {
    id: paymentAttemptId(record),
    mode,
    status: 'pending',
    ...(routeIsSelected ? { network: record.network, recipient: record.recipient } : {}),
    returnUrl: record.returnUrl,
    amount: record.amount,
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
  }
}

export function hostedCheckoutPaymentAttempt(record: HostedCheckoutAttemptRecord) {
  return record.paymentAttempts?.[record.paymentAttempts.length - 1] ?? initialPaymentAttempt(record)
}

export async function selectHostedCheckoutPaymentNetwork(input: {
  id: string
  attemptId: string
  network: string
}, dependencies: Dependencies = defaults) {
  const id = clean(input.id, 80)
  const attemptId = clean(input.attemptId, 80)
  const network = clean(input.network, 20).toLowerCase()
  if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(id) || !/^pat_[a-f0-9]{24}$/.test(attemptId)) throw new Error('Invalid hosted checkout attempt.')
  if (!NETWORKS.has(network)) throw new Error('Hosted checkout payment network is invalid.')
  const secret = dependencies.signingSecret()
  if (!dependencies.hasStore() || secret.length < 32) throw new Error('Hosted checkout storage is unavailable.')
  let selected: HostedCheckoutPaymentAttempt | null = null
  await dependencies.mutate(STORE_KEY, current => {
    const safe = current ?? { checkouts: {}, idempotency: {} }
    const record = safe.checkouts[id]
    if (!record || !integrityValid(record, secret) || hostedCheckoutMode(record) !== 'human') throw new Error('Hosted checkout is invalid.')
    if (dependencies.now().getTime() >= Date.parse(record.expiresAt)) throw new Error('Hosted checkout expired.')
    const currentAttempt = hostedCheckoutPaymentAttempt(record)
    if (currentAttempt.id !== attemptId) throw new Error('Payment attempt does not match this checkout.')
    if (currentAttempt.status !== 'pending') throw new Error('Payment attempt has already started.')
    const option = hostedCheckoutPaymentOption(record, network)
    if (!option) throw new Error('Hosted checkout payment network is not available.')
    if (currentAttempt.network && currentAttempt.network !== option.network) throw new Error('Payment attempt is already locked to another network.')
    const paymentAttempts = updateCurrentPaymentAttempt(record, attempt => ({
      ...attempt,
      network: option.network,
      recipient: option.recipient,
      updatedAt: dependencies.now().toISOString(),
    }))
    selected = paymentAttempts[paymentAttempts.length - 1]
    return { ...safe, checkouts: { ...safe.checkouts, [id]: { ...record, paymentAttempts } } }
  })
  if (!selected) throw new Error('Hosted checkout payment network could not be selected.')
  return { ...(selected as HostedCheckoutPaymentAttempt) }
}

function publicPaymentAttempt(record: CheckoutRecord, includeTransaction = false) {
  return publicPaymentAttemptValue(hostedCheckoutPaymentAttempt(record), includeTransaction)
}

function publicPaymentAttemptValue(value: HostedCheckoutPaymentAttempt, includeTransaction = false) {
  const { returnUrl: _returnUrl, recipient: _recipient, payer: _payer, transaction, ...attempt } = value
  return includeTransaction ? { ...attempt, ...(transaction ? { transaction } : {}), ...(_payer ? { payer: _payer } : {}) } : attempt
}

function updateCurrentPaymentAttempt(
  record: CheckoutRecord,
  update: (attempt: HostedCheckoutPaymentAttempt) => HostedCheckoutPaymentAttempt,
) {
  const attempts = record.paymentAttempts?.length ? [...record.paymentAttempts] : [initialPaymentAttempt(record)]
  attempts[attempts.length - 1] = update(attempts[attempts.length - 1])
  return attempts
}

export async function readVerifiedHostedCheckoutRecord(id: string, options: { allowExpiredForReconciliation?: boolean } = {}) {
  const normalizedId = clean(id, 80)
  if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(normalizedId) || !defaults.hasStore()) return null
  const secret = defaults.signingSecret()
  if (secret.length < 32) return null
  const store = await defaults.read(STORE_KEY)
  const record = store?.checkouts?.[normalizedId]
  if (!record || !integrityValid(record, secret)) return null
  if (!options.allowExpiredForReconciliation && defaults.now().getTime() >= Date.parse(record.expiresAt)) return null
  return { ...record }
}

export function hostedCheckoutPaymentOptions(record: Pick<CheckoutRecord, 'network' | 'recipient' | 'paymentOptions'>) {
  return record.paymentOptions?.map(option => ({ ...option })) ?? [{ network: record.network, recipient: record.recipient }]
}

export function hostedCheckoutPaymentOption(record: Pick<CheckoutRecord, 'network' | 'recipient' | 'paymentOptions'>, network: string) {
  return hostedCheckoutPaymentOptions(record).find(option => option.network === network) ?? null
}

export async function markHostedCheckoutPaid(input: {
  id: string
  txHash: string
  payer: string
  amount: string
  confirmedAt: string
  network?: string
  referenceType?: 'evm_tx_hash' | 'circle_gateway_transfer'
}, dependencies: Dependencies = defaults) {
  const id = clean(input.id, 80)
  if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(id)) throw new Error('Invalid hosted checkout id.')
  const txHash = clean(input.txHash, 80)
  const payer = clean(input.payer, 80)
  const amount = normalizePositiveUsdc(input.amount)
  const confirmedAt = clean(input.confirmedAt, 40)
  const requestedNetwork = clean(input.network, 20).toLowerCase()
  const referenceType = input.referenceType ?? 'evm_tx_hash'
  const confirmedAtMs = Date.parse(confirmedAt)
  if (referenceType === 'evm_tx_hash' && !/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error('Invalid hosted checkout transaction hash.')
  if (referenceType === 'circle_gateway_transfer' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(txHash)) throw new Error('Invalid Circle Gateway transfer id.')
  if (!isAddress(payer)) throw new Error('Invalid hosted checkout payer.')
  if (!amount) throw new Error('Invalid hosted checkout amount.')
  if (!Number.isFinite(confirmedAtMs)) throw new Error('Invalid hosted checkout confirmation time.')
  const secret = dependencies.signingSecret()
  if (!dependencies.hasStore() || secret.length < 32) throw new Error('Hosted checkout storage is unavailable.')
  let result: CheckoutRecord | null = null
  let newlyPaid = false
  await dependencies.mutate(STORE_KEY, current => {
    const safe = current ?? { checkouts: {}, idempotency: {} }
    const record = safe.checkouts[id]
    if (!record || !integrityValid(record, secret)) {
      throw new Error('Hosted checkout is invalid.')
    }
    const paymentOptions = hostedCheckoutPaymentOptions(record)
    const selectedNetwork = requestedNetwork || (paymentOptions.length === 1 ? paymentOptions[0].network : '')
    if (!hostedCheckoutPaymentOption(record, selectedNetwork)) throw new Error('Hosted checkout payment network is invalid.')
    const currentAttempt = hostedCheckoutPaymentAttempt(record)
    if (hostedCheckoutMode(record) === 'human' && paymentOptions.length > 1 && currentAttempt.network !== selectedNetwork) {
      throw new Error('Hosted checkout payment attempt is not locked to this network.')
    }
    const createdAtMs = Date.parse(record.createdAt)
    const expiresAtMs = Date.parse(record.expiresAt)
    if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) throw new Error('Hosted checkout has an invalid payment window.')
    if (confirmedAtMs < createdAtMs) throw new Error('Hosted checkout payment confirmed before creation.')
    const gatewaySettlementGrace = referenceType === 'circle_gateway_transfer' ? 5 * 60_000 : 0
    if (confirmedAtMs > expiresAtMs + gatewaySettlementGrace) throw new Error('Hosted checkout payment confirmed after expiry.')
    const reusedBy = Object.values(safe.checkouts).find(item =>
      item.id !== id && item.payment?.txHash.toLowerCase() === txHash.toLowerCase()
    )
    if (reusedBy) throw new Error('Transaction is already linked to another hosted checkout.')
    if (record.payment && record.payment.txHash.toLowerCase() !== txHash.toLowerCase()) {
      throw new Error('Hosted checkout is already linked to another payment.')
    }
    if (record.payment?.network && record.payment.network !== selectedNetwork) {
      throw new Error('Hosted checkout is already linked to another payment network.')
    }
    newlyPaid = !record.payment
    const payment: HostedCheckoutPayment = record.payment ?? {
      status: record.settlement && record.payout?.status !== 'validated' && record.payout?.status !== 'settled' ? 'processing' : 'paid',
      referenceType,
      txHash,
      payer: getAddress(payer),
      amount,
      confirmedAt: new Date(confirmedAtMs).toISOString(),
      network: selectedNetwork as HostedCheckoutNetwork,
    }
    const paymentAttempts = updateCurrentPaymentAttempt(record, attempt => ({
      ...attempt,
      status: payment.status,
      network: payment.network ?? record.network,
      recipient: hostedCheckoutPaymentOption(record, payment.network ?? record.network)?.recipient ?? record.recipient,
      amount: payment.amount,
      referenceType: payment.referenceType,
      transaction: payment.txHash,
      payer: payment.payer,
      confirmedAt: payment.confirmedAt,
      ...(hostedCheckoutMode(record) === 'agentic' ? {
        receiptId: attempt.receiptId ?? `hpl_${attempt.id}`,
        receiptUrl: attempt.receiptUrl ?? `/pay/a/${encodeURIComponent(record.id)}?attempt=${encodeURIComponent(attempt.id)}`,
      } : {}),
      updatedAt: dependencies.now().toISOString(),
    }))
    result = { ...record, payment, paymentAttempts }
    let updated: CheckoutStore = { ...safe, checkouts: { ...safe.checkouts, [id]: result } }
    if (newlyPaid) updated = enqueueWebhook(updated, record.partnerId, payment.status === 'paid' ? 'payment.confirmed' : 'payment.processing', {
      checkoutId: record.id,
      status: payment.status,
      network: payment.network ?? record.network,
      amount: payment.amount,
      payer: payment.payer,
      ...(payment.referenceType === 'circle_gateway_transfer'
        ? { gatewayTransferId: payment.txHash }
        : { transactionHash: payment.txHash }),
      confirmedAt: payment.confirmedAt,
    }, dependencies.now())
    return updated
  })
  if (!result) throw new Error('Hosted checkout could not be updated.')
  if (newlyPaid) startWebhookDrain(dependencies)
  return { ...(result as CheckoutRecord) }
}

export async function attachHostedCheckoutReceipt(input: {
  id: string
  txHash: string
  receiptId: string
  receiptUrl: string
}, dependencies: Dependencies = defaults) {
  const id = clean(input.id, 80)
  const txHash = clean(input.txHash, 80).toLowerCase()
  const receiptId = clean(input.receiptId, 180)
  const receiptUrl = clean(input.receiptUrl, 240)
  if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(id)) throw new Error('Invalid hosted checkout id.')
  if (!txHash || !receiptId || !receiptUrl.startsWith('/receipt/')) throw new Error('Invalid hosted checkout receipt.')
  let result: CheckoutRecord | null = null
  await dependencies.mutate(STORE_KEY, current => {
    const safe = current ?? { checkouts: {}, idempotency: {} }
    const record = safe.checkouts[id]
    if (!record || !integrityValid(record, dependencies.signingSecret())) throw new Error('Hosted checkout is invalid.')
    if (!record.payment || record.payment.txHash.toLowerCase() !== txHash) throw new Error('Hosted checkout payment does not match this receipt.')
    const paymentAttempts = updateCurrentPaymentAttempt(record, attempt => {
      if (attempt.transaction?.toLowerCase() !== txHash) throw new Error('Hosted checkout attempt does not match this receipt.')
      return { ...attempt, receiptId, receiptUrl, updatedAt: dependencies.now().toISOString() }
    })
    result = { ...record, paymentAttempts }
    return { ...safe, checkouts: { ...safe.checkouts, [id]: result } }
  })
  if (!result) throw new Error('Hosted checkout receipt could not be attached.')
  return { ...(result as CheckoutRecord) }
}

export async function beginHostedCheckoutAgenticAttempt(input: {
  id: string
  signatureHash: string
  nonce: string
  payer: string
  network: string
  startedAt: string
}, dependencies: Dependencies = defaults) {
  const id = clean(input.id, 80)
  const signatureHash = clean(input.signatureHash, 64).toLowerCase()
  const nonce = clean(input.nonce, 80).toLowerCase()
  const payer = clean(input.payer, 80)
  const network = clean(input.network, 20).toLowerCase()
  const startedAtMs = Date.parse(input.startedAt)
  if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(id)) throw new Error('Invalid hosted checkout id.')
  if (!/^[a-f0-9]{64}$/.test(signatureHash)) throw new Error('Invalid agent payment signature hash.')
  if (!/^0x[a-f0-9]{64}$/.test(nonce)) throw new Error('Invalid agent payment nonce.')
  if (!isAddress(payer)) throw new Error('Invalid agent payment payer.')
  if (!NETWORKS.has(network)) throw new Error('Invalid agent payment network.')
  if (!Number.isFinite(startedAtMs)) throw new Error('Invalid agent payment start time.')
  const secret = dependencies.signingSecret()
  if (!dependencies.hasStore() || secret.length < 32) throw new Error('Hosted checkout storage is unavailable.')
  let result: CheckoutRecord | null = null
  await dependencies.mutate(STORE_KEY, current => {
    const safe = current ?? { checkouts: {}, idempotency: {} }
    const record = safe.checkouts[id]
    if (!record || !integrityValid(record, secret)) throw new Error('Hosted checkout is invalid.')
    if (hostedCheckoutMode(record) !== 'agentic' || record.kind !== 'service' || record.flexible || record.settlement) throw new Error('Hosted checkout is not eligible for agentic payment.')
    if (!hostedCheckoutPaymentOption(record, network)) throw new Error('Agent payment network is invalid.')
    if (startedAtMs < Date.parse(record.createdAt) || startedAtMs > Date.parse(record.expiresAt)) throw new Error('Agent payment started outside the checkout window.')
    const attempt: HostedCheckoutAgenticAttempt = {
      signatureHash,
      nonce,
      payer: getAddress(payer),
      network: network as HostedCheckoutNetwork,
      startedAt: new Date(startedAtMs).toISOString(),
    }
    // Reconcile every saved attempt before accepting another one. Keep a wider
    // bounded journal to tolerate delayed Circle transfer indexing without
    // allowing unbounded attacker-controlled growth in the durable record.
    const attempts = [...(record.agenticAttempts ?? []).filter(item => item.signatureHash !== signatureHash), attempt].slice(-20)
    const paymentAttempts = updateCurrentPaymentAttempt(record, item => ({ ...item, updatedAt: dependencies.now().toISOString() }))
    result = { ...record, paymentAttempts, agenticAttempts: attempts }
    return { ...safe, checkouts: { ...safe.checkouts, [id]: result } }
  })
  if (!result) throw new Error('Agent payment attempt could not be recorded.')
  return { ...(result as CheckoutRecord) }
}

export async function markHostedCheckoutNairaPayout(input: { intentId: string; status: string }, dependencies: Dependencies = defaults) {
  const intentId = clean(input.intentId, 80)
  const status = clean(input.status, 30).toLowerCase()
  if (!intentId || !status) return null
  let result: CheckoutRecord | null = null
  let newlyDelivered = false
  let newlyFailed = false
  const delivered = status === 'validated' || status === 'settled'
  const failed = status === 'refunded' || status === 'expired'
  await dependencies.mutate(STORE_KEY, current => {
    const safe = current ?? { checkouts: {}, idempotency: {} }
    const record = Object.values(safe.checkouts).find(item => item.settlement?.intentId === intentId)
    if (!record || !integrityValid(record, dependencies.signingSecret())) return safe
    const alreadyPaid = record.payment?.status === 'paid'
    newlyDelivered = delivered && !alreadyPaid
    newlyFailed = failed && Boolean(record.payment) && record.payment?.status !== 'failed' && !alreadyPaid
    const nextPaymentStatus = alreadyPaid || delivered ? 'paid' : failed ? 'failed' : 'processing'
    result = {
      ...record,
      payout: {
        status,
        ...(record.payout?.deliveredAt ? { deliveredAt: record.payout.deliveredAt } : delivered ? { deliveredAt: dependencies.now().toISOString() } : {}),
      },
      ...(record.payment ? { payment: { ...record.payment, status: nextPaymentStatus } } : {}),
      paymentAttempts: updateCurrentPaymentAttempt(record, attempt => ({
        ...attempt,
        status: nextPaymentStatus,
        updatedAt: dependencies.now().toISOString(),
      })),
    }
    let updated: CheckoutStore = { ...safe, checkouts: { ...safe.checkouts, [record.id]: result } }
    if (newlyDelivered) updated = enqueueWebhook(updated, record.partnerId, 'payment.confirmed', {
      checkoutId: record.id,
      status: 'paid',
      settlementCurrency: 'NGN',
      settlementAmount: record.settlement?.amountNgn,
      providerStatus: status,
      transactionHash: record.payment?.txHash,
      confirmedAt: (result as CheckoutRecord).payout?.deliveredAt,
    }, dependencies.now())
    if (newlyFailed) updated = enqueueWebhook(updated, record.partnerId, 'payment.failed', {
      checkoutId: record.id,
      status: 'failed',
      settlementCurrency: 'NGN',
      settlementStatus: status,
      amount: record.payment?.amount,
      transactionHash: record.payment?.txHash,
    }, dependencies.now())
    return updated
  })
  if (newlyDelivered || newlyFailed) startWebhookDrain(dependencies)
  return result
}

function normalizedOrigin(value: string) {
  try {
    const url = new URL(value)
    const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return url.protocol === 'https:' || localHttp ? url.origin : ''
  } catch {
    return ''
  }
}

function normalizePositiveUsdc(value: unknown) {
  const normalized = clean(value, 40)
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return ''
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(`${whole}${fraction.padEnd(6, '0')}`)
  return units > 0n ? formatUnits(units, 6) : ''
}

function pruneCheckoutStore(store: CheckoutStore, nowMs: number) {
  const retained = Object.values(store.checkouts)
    .filter(record => Date.parse(record.expiresAt) >= nowMs - CHECKOUT_RETENTION_MS)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-MAX_CHECKOUT_RECORDS)
  const retainedIds = new Set(retained.map(record => record.id))
  const activeWebhookEvents = (store.outbox ?? []).filter(item => item.status === 'pending' || item.status === 'delivering')
  const terminalWebhookEvents = (store.outbox ?? [])
    .filter(item => item.status === 'delivered' || item.status === 'dead')
    .filter(item => Date.parse(item.deliveredAt ?? item.deadAt ?? item.createdAt) >= nowMs - WEBHOOK_EVENT_RETENTION_MS)
    .sort((left, right) => Date.parse(left.deliveredAt ?? left.deadAt ?? left.createdAt) - Date.parse(right.deliveredAt ?? right.deadAt ?? right.createdAt))
    .slice(-MAX_TERMINAL_WEBHOOK_EVENTS)
  return {
    checkouts: Object.fromEntries(retained.map(record => [record.id, record])),
    idempotency: Object.fromEntries(Object.entries(store.idempotency).filter(([, id]) => retainedIds.has(id))),
    outbox: [...activeWebhookEvents, ...terminalWebhookEvents],
  }
}

function checkoutRequestHash(input: {
  partnerId: string
  kind: string
  merchantName: string
  title: string
  description: string
  amount: string
  flexible: boolean
  network: string
  recipient: string
  paymentOptions?: HostedCheckoutPaymentOption[]
  memo: string
  returnUrl: string
  expiresInMinutes: number
  checkoutMode: HostedCheckoutMode
  agenticType?: HostedCheckoutAgenticType
}) {
  const fields: unknown[] = [
    input.partnerId,
    input.kind,
    input.merchantName,
    input.title,
    input.description,
    input.amount,
    input.flexible,
    input.network,
    input.recipient,
    input.memo,
    input.returnUrl,
    input.expiresInMinutes,
    input.checkoutMode,
    input.agenticType ?? '',
  ]
  if (input.paymentOptions !== undefined) {
    fields.push(input.paymentOptions.map(option => [option.network, option.recipient]))
  }
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex')
}

function validRecipient(network: string, recipient: string) {
  return NETWORKS.has(network) && isAddress(recipient) && recipient.toLowerCase() !== '0x0000000000000000000000000000000000000000'
}

function validCheckoutRouting(record: Pick<CheckoutRecord, 'network' | 'recipient' | 'paymentOptions'>) {
  if (!validRecipient(record.network, record.recipient)) return false
  if (record.paymentOptions === undefined) return true
  if (!Array.isArray(record.paymentOptions) || record.paymentOptions.length < 1 || record.paymentOptions.length > 3) return false
  const networks = new Set<string>()
  for (const option of record.paymentOptions) {
    if (!option || !validRecipient(option.network, option.recipient) || networks.has(option.network)) return false
    networks.add(option.network)
  }
  return record.paymentOptions.some(option => option.network === record.network && option.recipient === record.recipient)
}

function normalizeRequestedPaymentOptions(value: unknown) {
  if (value === undefined) return { options: undefined as HostedCheckoutPaymentOption[] | undefined, error: '' }
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    return { options: undefined, error: 'paymentOptions must contain one to three supported networks.' }
  }
  const options: HostedCheckoutPaymentOption[] = []
  const networks = new Set<string>()
  for (const item of value) {
    const network = clean((item as { network?: unknown })?.network, 20).toLowerCase()
    const rawRecipient = clean((item as { recipient?: unknown })?.recipient, 80)
    const recipient = isAddress(rawRecipient) ? getAddress(rawRecipient) : rawRecipient
    if (!validRecipient(network, recipient)) return { options: undefined, error: 'Every payment option requires a supported network and valid recipient.' }
    if (networks.has(network)) return { options: undefined, error: 'Each payment network can appear only once.' }
    networks.add(network)
    options.push({ network: network as HostedCheckoutNetwork, recipient })
  }
  return { options, error: '' }
}

function checkoutPaymentUrl(record: CheckoutRecord) {
  const stableDirectId = createHash('sha256').update(`hosted-checkout:${record.id}`).digest('hex')
  const attempt = hostedCheckoutPaymentAttempt(record)
  const selectedOption = attempt.network ? hostedCheckoutPaymentOption(record, attempt.network) : null
  const params = new URLSearchParams({
    src: record.settlement?.mode === 'ngn' ? 'bank-receive' : record.kind === 'service' ? 'service' : 'partner',
    n: selectedOption?.network ?? record.network,
    m: record.memo,
    checkout: record.id,
    attempt: hostedCheckoutPaymentAttempt(record).id,
    id: `0x${stableDirectId}`,
  })
  if (record.settlement?.mode === 'ngn') {
    params.set('hostedKind', record.kind)
    params.set('settlementMode', 'ngn')
    params.set('settlement', 'instant_fiat')
    params.set('offramp', 'paycrest')
    params.set('intent', record.settlement.intentId)
    params.set('merchant', record.partnerId)
    params.set('ngn', record.settlement.amountNgn)
    params.set('bank', record.settlement.bankName)
    params.set('acct', `****${record.settlement.bankLast4}`)
    params.set('acctName', record.settlement.accountName)
  }
  if (record.kind === 'service') {
    params.set('merchantName', record.merchantName)
    params.set('checkoutTitle', record.title)
    if (record.description) params.set('checkoutDescription', record.description)
  }
  if (record.flexible) params.set('f', '1')
  else params.set('a', record.amount)
  params.set('e', selectedOption?.recipient ?? record.recipient)
  const paymentOptions = hostedCheckoutPaymentOptions(record)
  if (paymentOptions.length > 1) params.set('multi', '1')
  for (const option of paymentOptions) params.set(`e_${option.network}`, option.recipient)
  return `/pay?${params.toString()}`
}

export function hostedCheckoutAgentPaymentUrl(record: HostedCheckoutAttemptRecord & Pick<CheckoutRecord, 'kind' | 'flexible' | 'settlement'>) {
  if (hostedCheckoutMode(record) !== 'agentic' || record.kind !== 'service' || record.flexible || record.settlement) return ''
  return `/api/v2/checkouts/agent?id=${encodeURIComponent(record.id)}&attempt=${encodeURIComponent(hostedCheckoutPaymentAttempt(record).id)}`
}

export function hostedCheckoutAgentUiUrl(record: HostedCheckoutAttemptRecord & Pick<CheckoutRecord, 'kind' | 'flexible' | 'settlement'>) {
  return hostedCheckoutAgentPaymentUrl(record) ? `/pay/a/${encodeURIComponent(record.id)}?attempt=${encodeURIComponent(hostedCheckoutPaymentAttempt(record).id)}` : ''
}

function hostedCheckoutUiUrl(record: CheckoutRecord) {
  return hostedCheckoutMode(record) === 'agentic'
    ? hostedCheckoutAgentUiUrl(record)
    : `/pay/c/${encodeURIComponent(record.id)}?attempt=${encodeURIComponent(hostedCheckoutPaymentAttempt(record).id)}`
}

export function createHostedCheckoutsHandler(dependencies: Dependencies = defaults) {
  return async function hostedCheckoutsHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
    if (!dependencies.hasStore()) return res.status(503).json({ ok: false, error: 'Hosted checkout storage is unavailable.' })
    const secret = dependencies.signingSecret()
    if (secret.length < 32) return res.status(503).json({ ok: false, error: 'Hosted checkout signing is not configured.' })

    if (req.method === 'GET') {
      const id = clean(req.query?.id, 80)
      if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(id)) return res.status(400).json({ ok: false, error: 'Invalid checkout id.' })
      const store = await dependencies.read(STORE_KEY)
      const record = store?.checkouts?.[id]
      if (!record) return res.status(404).json({ ok: false, error: 'Checkout not found.' })
      if (!integrityValid(record, secret)) return res.status(409).json({ ok: false, error: 'Checkout integrity verification failed.' })
      const requestedAttemptId = clean(req.query?.attempt, 80)
      if (requestedAttemptId && requestedAttemptId !== hostedCheckoutPaymentAttempt(record).id) {
        return res.status(409).json({ ok: false, error: 'Payment attempt does not match this checkout.' })
      }
      if (req.query?.purpose === 'status') {
        const policy = await dependencies.policy(req)
        if (!policy || policy.partnerId !== record.partnerId) return res.status(401).json({ ok: false, error: 'Valid partner API credentials are required.' })
        const expired = dependencies.now().getTime() >= Date.parse(record.expiresAt)
        return res.json({
          ok: true,
          checkoutId: record.id,
          checkoutMode: hostedCheckoutMode(record),
          agenticType: record.agenticType,
          paymentAttempt: hostedCheckoutPaymentAttempt(record),
          status: record.payment?.status ?? (expired ? 'expired' : 'pending'),
          paymentStatus: record.payment?.status,
          settlementStatus: record.payout?.status,
          network: record.payment?.network ?? hostedCheckoutPaymentAttempt(record).network ?? record.network,
          availableNetworks: hostedCheckoutPaymentOptions(record).map(option => option.network),
          expiresAt: record.expiresAt,
          settlementMode: record.settlement?.mode ?? 'usdc',
          ...(record.payment ? { payment: record.payment } : {}),
        })
      }
      if (dependencies.now().getTime() >= Date.parse(record.expiresAt)) return res.status(410).json({ ok: false, error: 'Checkout expired.' })
      return res.json({
        ok: true,
          checkout: {
            id: record.id,
            checkoutMode: hostedCheckoutMode(record),
            agenticType: record.agenticType,
          kind: record.kind,
          merchantName: record.merchantName,
          title: record.title,
          description: record.description,
          amount: record.amount,
          flexible: record.flexible,
          network: hostedCheckoutPaymentAttempt(record).network ?? record.network,
            availableNetworks: hostedCheckoutPaymentOptions(record).map(option => option.network),
          settlementMode: record.settlement?.mode ?? 'usdc',
          status: record.payment?.status ?? 'pending',
          settlementStatus: record.payout?.status,
            expiresAt: record.expiresAt,
            paymentAttempt: publicPaymentAttempt(record, req.query?.purpose === 'return'),
          },
          ...(hostedCheckoutMode(record) === 'human' ? { paymentUrl: checkoutPaymentUrl(record) } : {}),
          ...(hostedCheckoutAgentPaymentUrl(record) ? { agentPaymentUrl: hostedCheckoutAgentPaymentUrl(record) } : {}),
        ...(req.query?.purpose === 'return' && record.returnUrl ? { returnUrl: record.returnUrl } : {}),
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    if (req.query?.action === 'select-network') {
      try {
        const paymentAttempt = await selectHostedCheckoutPaymentNetwork({
          id: clean(req.query?.id, 80),
          attemptId: clean(req.query?.attempt, 80),
          network: clean(req.body?.network, 20),
        }, dependencies)
        return res.json({ ok: true, paymentAttempt: publicPaymentAttemptValue(paymentAttempt) })
      } catch (error) {
        return res.status(409).json({ ok: false, error: error instanceof Error ? error.message : 'Payment network could not be selected.' })
      }
    }
    const policy = await dependencies.policy(req)
    if (!policy) return res.status(401).json({ ok: false, error: 'Valid partner API credentials are required.' })

    const kind = clean(req.body?.kind, 40)
    const checkoutMode = (clean(req.body?.checkoutMode, 20).toLowerCase() || 'human') as HostedCheckoutMode
    const requestedAgenticType = clean(req.body?.agenticType, 40).toLowerCase()
    const agenticType = requestedAgenticType as HostedCheckoutAgenticType
    const merchantName = 'projectManaged' in policy ? policy.merchantName : clean(req.body?.merchantName, 80)
    const title = clean(req.body?.title, 100) || (kind === 'service' ? 'Service checkout' : 'Payment request')
    const description = clean(req.body?.description, 240)
    const amount = req.body?.flexible === true ? '' : normalizePositiveUsdc(req.body?.amount)
    const flexible = req.body?.flexible === true
    const isNairaProject = 'projectManaged' in policy && policy.settlementMode === 'ngn'
    const requestedNetwork = clean(req.body?.network, 20).toLowerCase()
    const requestedRecipient = clean(req.body?.recipient, 80)
    if ('projectManaged' in policy && (req.body?.recipient !== undefined || req.body?.paymentOptions !== undefined || (checkoutMode === 'human' && req.body?.network !== undefined))) {
      return res.status(400).json({ ok: false, error: 'Payment routing is managed in the developer dashboard.' })
    }
    const normalizedOptions = 'projectManaged' in policy
      ? { options: policy.paymentOptions, error: '' }
      : normalizeRequestedPaymentOptions(req.body?.paymentOptions)
    if (normalizedOptions.error) return res.status(400).json({ ok: false, error: normalizedOptions.error })
    const routingOptions = normalizedOptions.options
    if (checkoutMode === 'agentic' && routingOptions && routingOptions.length > 1 && !requestedNetwork && !('projectManaged' in policy)) {
      return res.status(400).json({ ok: false, error: 'Agentic checkout must select exactly one payment network.' })
    }
    const defaultNetwork = (checkoutMode === 'agentic' ? requestedNetwork : '') || clean(req.body?.defaultNetwork, 20).toLowerCase() || ('projectManaged' in policy ? policy.defaultNetwork : '') || requestedNetwork || routingOptions?.[0]?.network || ''
    const defaultOption = routingOptions?.find(option => option.network === defaultNetwork)
    const network = routingOptions ? defaultOption?.network ?? '' : defaultNetwork
    const legacyRecipient = isAddress(requestedRecipient) ? getAddress(requestedRecipient) : requestedRecipient
    const recipient = routingOptions ? defaultOption?.recipient ?? '' : legacyRecipient
    const memo = clean(req.body?.memo, 90) || title
    const returnUrl = clean(req.body?.returnUrl, 300)
    const expiresInMinutes = Number(req.body?.expiresInMinutes ?? 60)

    if (!KINDS.has(kind)) return res.status(400).json({ ok: false, error: 'Private beta supports usdc_request and service checkouts.' })
    if (checkoutMode !== 'human' && checkoutMode !== 'agentic') return res.status(400).json({ ok: false, error: 'checkoutMode must be human or agentic.' })
    if (checkoutMode === 'agentic' && agenticType !== 'creator_earnings' && agenticType !== 'agent_treasury') return res.status(400).json({ ok: false, error: 'Agentic checkout requires agenticType creator_earnings or agent_treasury.' })
    if (checkoutMode === 'human' && requestedAgenticType) return res.status(400).json({ ok: false, error: 'agenticType is only valid for agentic checkout.' })
    if (checkoutMode === 'agentic' && (kind !== 'service' || flexible || isNairaProject)) return res.status(400).json({ ok: false, error: 'Agentic checkout requires a fixed USDC service payment.' })
    if (checkoutMode === 'agentic' && routingOptions && !routingOptions.some(option => option.network === network)) return res.status(400).json({ ok: false, error: 'Agentic checkout network is not enabled for this project.' })
    if (merchantName.length < 2) return res.status(400).json({ ok: false, error: 'merchantName is required.' })
    if (!NETWORKS.has(network)) return res.status(400).json({ ok: false, error: routingOptions ? 'defaultNetwork must match a payment option.' : 'Unsupported network.' })
    if (!validRecipient(network, recipient)) return res.status(400).json({ ok: false, error: 'Invalid recipient for the selected network.' })
    if (checkoutMode === 'human' && routingOptions && requestedNetwork && requestedNetwork !== network) return res.status(400).json({ ok: false, error: 'network must match defaultNetwork when paymentOptions are supplied.' })
    if (routingOptions && requestedRecipient && legacyRecipient !== recipient) return res.status(400).json({ ok: false, error: 'recipient must match the default payment option.' })
    if (!flexible && !amount) return res.status(400).json({ ok: false, error: 'Enter a positive USDC amount or set flexible to true.' })
    if (isNairaProject && flexible) return res.status(400).json({ ok: false, error: 'Naira settlement currently requires a fixed USDC amount.' })
    if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 5 || expiresInMinutes > 1_440) return res.status(400).json({ ok: false, error: 'expiresInMinutes must be a whole number between 5 and 1440.' })
    if (returnUrl) {
      const origin = normalizedOrigin(returnUrl)
      if (!origin || !policy.allowedOrigins.includes(origin)) return res.status(400).json({ ok: false, error: 'returnUrl origin is not allowlisted for this partner.' })
    }
    if (kind === 'service' && !returnUrl) return res.status(400).json({ ok: false, error: 'Service checkouts require an allowlisted returnUrl.' })

    const idempotencyKey = clean(req.headers['idempotency-key'], 128)
    if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ ok: false, error: 'A valid Idempotency-Key header is required.' })

    const requestHash = checkoutRequestHash({
      partnerId: policy.partnerId,
      kind,
      merchantName,
      title,
      description,
      amount: flexible ? '' : amount,
      flexible,
      network,
      recipient,
      memo,
      returnUrl,
      expiresInMinutes,
      checkoutMode,
      ...(checkoutMode === 'agentic' ? { agenticType } : {}),
      ...(checkoutMode === 'human' && routingOptions ? { paymentOptions: routingOptions } : {}),
    })
    const existingStore = await dependencies.read(STORE_KEY)
    const existingId = existingStore?.idempotency?.[`${policy.partnerId}:${idempotencyKey}`]
    const existingRecord = existingId ? existingStore?.checkouts?.[existingId] : undefined
    if (existingRecord) {
      if (!integrityValid(existingRecord, secret)) return res.status(409).json({ ok: false, error: 'Checkout integrity verification failed.' })
      if (existingRecord.requestHash !== requestHash) return res.status(409).json({ ok: false, error: 'Idempotency-Key was already used for a different checkout request.' })
      return res.status(200).json({
        ok: true,
        replayed: true,
        checkoutId: existingRecord.id,
        checkoutMode: hostedCheckoutMode(existingRecord),
        agenticType: existingRecord.agenticType,
        paymentAttemptId: hostedCheckoutPaymentAttempt(existingRecord).id,
        checkoutUrl: hostedCheckoutUiUrl(existingRecord),
        ...(hostedCheckoutMode(existingRecord) === 'agentic' ? { agentPaymentUrl: hostedCheckoutAgentPaymentUrl(existingRecord) } : {}),
        expiresAt: existingRecord.expiresAt,
      })
    }
    let createdId = isNairaProject ? dependencies.createId() : ''
    let replayed = false
    let idempotencyConflict = false
    const now = dependencies.now()
    const nairaOrder = isNairaProject
      ? await dependencies.prepareNaira(policy as DeveloperCheckoutPolicy, createdId, amount)
      : null
    const store = await dependencies.mutate(STORE_KEY, current => {
      const safe = pruneCheckoutStore(current ?? { checkouts: {}, idempotency: {} }, now.getTime())
      const replayId = safe.idempotency[`${policy.partnerId}:${idempotencyKey}`]
      if (replayId && safe.checkouts[replayId]) {
        createdId = replayId
        idempotencyConflict = safe.checkouts[replayId].requestHash !== requestHash
        replayed = true
        return safe
      }
      if (!createdId) createdId = dependencies.createId()
      const routedNetwork = nairaOrder ? 'base' : network
      const routedRecipient = nairaOrder?.receiveAddress ?? recipient
      const hostedExpiry = new Date(now.getTime() + expiresInMinutes * 60_000).getTime()
      const providerExpiry = nairaOrder?.validUntil ? Date.parse(nairaOrder.validUntil) : Number.POSITIVE_INFINITY
      const unsigned: Omit<CheckoutRecord, 'integrity'> = {
        id: createdId,
        partnerId: policy.partnerId,
        kind: kind as CheckoutRecord['kind'],
        merchantName,
        title,
        description,
        amount: flexible ? '' : nairaOrder?.payableUsdc ?? amount,
        flexible,
        network: routedNetwork as CheckoutRecord['network'],
        recipient: routedRecipient,
        memo,
        returnUrl,
        createdAt: now.toISOString(),
        expiresAt: new Date(Math.min(hostedExpiry, Number.isFinite(providerExpiry) ? providerExpiry : hostedExpiry)).toISOString(),
        requestHash,
        checkoutMode,
        ...(checkoutMode === 'agentic' ? { agenticType } : {}),
        ...(checkoutMode === 'human' && routingOptions && !nairaOrder ? { paymentOptions: routingOptions } : {}),
        ...(nairaOrder ? { settlement: {
          mode: 'ngn' as const,
          provider: 'paycrest' as const,
          orderId: nairaOrder.orderId,
          intentId: nairaOrder.intentId,
          requestedUsdc: nairaOrder.requestedUsdc,
          amountNgn: nairaOrder.amountNgn,
          bankName: nairaOrder.bankName,
          bankLast4: nairaOrder.bankLast4,
          accountName: nairaOrder.accountName,
        } } : {}),
      }
      unsigned.paymentAttempts = [initialPaymentAttempt(unsigned)]
      const record: CheckoutRecord = { ...unsigned, integrity: sign(unsigned, secret) }
      const updated: CheckoutStore = {
        ...safe,
        checkouts: { ...safe.checkouts, [createdId]: record },
        idempotency: { ...safe.idempotency, [`${policy.partnerId}:${idempotencyKey}`]: createdId },
      }
      return enqueueWebhook(updated, record.partnerId, 'checkout.created', {
        checkoutId: record.id,
        status: 'pending',
        checkoutMode: hostedCheckoutMode(record),
        agenticType: record.agenticType,
        paymentAttemptId: hostedCheckoutPaymentAttempt(record).id,
        amount: record.amount,
        flexible: record.flexible,
        network: record.network,
        paymentPath: hostedCheckoutMode(record),
        expiresAt: record.expiresAt,
      }, now)
    })
    if (idempotencyConflict) return res.status(409).json({ ok: false, error: 'Idempotency-Key was already used for a different checkout request.' })
    const record = store.checkouts[createdId]
    if (!replayed) startWebhookDrain(dependencies)
    return res.status(replayed ? 200 : 201).json({
      ok: true,
      replayed,
      checkoutId: record.id,
      checkoutMode: hostedCheckoutMode(record),
      agenticType: record.agenticType,
      paymentAttemptId: hostedCheckoutPaymentAttempt(record).id,
      checkoutUrl: hostedCheckoutUiUrl(record),
      ...(hostedCheckoutMode(record) === 'agentic' ? { agentPaymentUrl: hostedCheckoutAgentPaymentUrl(record) } : {}),
      expiresAt: record.expiresAt,
    })
    } catch (error) {
      console.error('[hosted-checkouts] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(503).json({ ok: false, error: 'Hosted checkout is temporarily unavailable.' })
    }
  }
}

export default createHostedCheckoutsHandler()

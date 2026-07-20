import { randomUUID } from 'node:crypto'
import { isAddress } from 'viem'
import { createVtpassRequestId, type VtpassTransactionResult } from '../vtpass-client.js'
import type { VtpassPhase0Config } from '../vtpass-config.js'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from '../render-durable-store.js'

export type PocketBillsIntentState =
  | 'quoted'
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'vending'
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'refund_pending'
  | 'refunding'
  | 'refund_submitted'
  | 'refunded'
  | 'needs_review'

export type PocketBillsIntent = {
  id: string
  ownerId: string
  idempotencyKey: string
  requestFingerprint: string
  requestId: string
  state: PocketBillsIntentState
  category: 'airtime'
  serviceId: string
  serviceName: string
  phone: string
  amountNgn: string
  amountNgnMinor: string
  amountUsdc: string
  fxRateNgnPerUsdc: string
  network: 'base'
  treasuryAddress: string
  payerWallet: string
  quoteExpiresAt: number
  txHash: string
  paymentAmountUsdc: string
  providerCode: string
  providerStatus: string
  providerEnvironment: 'sandbox' | 'live'
  providerTransactionId: string
  providerDescription: string
  providerAttemptedAt: number
  requeryAttempts: number
  lastRequeryAt: number
  refundTxHash: string
  refundIdempotencyKey: string
  refundCircleTransactionId: string
  refundCircleState: string
  refundClaimedAt: number
  refundSubmittedAt: number
  refundConfirmedAt: number
  refundLastCheckedAt: number
  failureReason: string
  createdAt: number
  updatedAt: number
}

export type PublicPocketBillsIntent = Omit<
  PocketBillsIntent,
  | 'ownerId'
  | 'idempotencyKey'
  | 'requestFingerprint'
  | 'amountNgnMinor'
  | 'refundIdempotencyKey'
  | 'refundCircleTransactionId'
  | 'refundCircleState'
  | 'refundClaimedAt'
  | 'refundSubmittedAt'
  | 'refundLastCheckedAt'
>

type BillsStoreData = {
  version: 1
  intents: Record<string, PocketBillsIntent>
  idempotency: Record<string, string>
  transactionHashes: Record<string, string>
  providerTransactions: Record<string, string>
}

type BillsStorage = {
  ready(): boolean
  read<T>(key: string): Promise<T | undefined>
  mutate<T>(key: string, mutate: (current: T | undefined) => T | Promise<T>): Promise<T>
}

type BillsStoreOptions = {
  config: VtpassPhase0Config
  storage?: BillsStorage
  now?: () => number
  uuid?: () => string
}

export class PocketBillsStoreError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'PocketBillsStoreError'
    this.code = code
    this.status = status
  }
}

const SERVICE_IDS = new Set(['mtn', 'airtel', 'glo', 'etisalat', '9mobile'])
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{16,128}$/
const EVM_TX_PATTERN = /^0x[a-fA-F0-9]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_QUOTE_LIFETIME_MS = 15 * 60_000

function emptyStore(): BillsStoreData {
  return { version: 1, intents: {}, idempotency: {}, transactionHashes: {}, providerTransactions: {} }
}

function normalizeStore(value: unknown): BillsStoreData {
  if (!value || typeof value !== 'object') return emptyStore()
  const current = value as Partial<BillsStoreData>
  return {
    version: 1,
    intents: current.intents && typeof current.intents === 'object' ? current.intents : {},
    idempotency: current.idempotency && typeof current.idempotency === 'object' ? current.idempotency : {},
    transactionHashes: current.transactionHashes && typeof current.transactionHashes === 'object' ? current.transactionHashes : {},
    providerTransactions: current.providerTransactions && typeof current.providerTransactions === 'object' ? current.providerTransactions : {},
  }
}

function cleanText(value: unknown, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function canonicalDecimal(value: unknown, decimals: number, label: string) {
  const raw = String(value ?? '').trim()
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(raw)) {
    throw new PocketBillsStoreError('BILLS_INVALID_AMOUNT', `${label} is invalid.`)
  }
  const [whole, fraction = ''] = raw.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0'
  const normalizedFraction = fraction.replace(/0+$/, '')
  const result = normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole
  if (Number(result) <= 0) throw new PocketBillsStoreError('BILLS_INVALID_AMOUNT', `${label} must be greater than zero.`)
  return result
}

function decimalToMinor(value: string, decimals: number) {
  const [whole, fraction = ''] = value.split('.')
  return (BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0'))).toString()
}

function policyMinor(value: number | null, label: string) {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    throw new PocketBillsStoreError('BILLS_POLICY_NOT_READY', `${label} is not configured.`, 503)
  }
  return BigInt(Math.round(value * 100))
}

function lagosDay(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function idempotencyIndex(ownerId: string, idempotencyKey: string) {
  return `${ownerId}:${idempotencyKey}`
}

function assertOwner(intent: PocketBillsIntent | undefined, ownerId: string) {
  if (!intent) throw new PocketBillsStoreError('BILLS_NOT_FOUND', 'Bill payment was not found.', 404)
  if (intent.ownerId !== ownerId) throw new PocketBillsStoreError('BILLS_FORBIDDEN', 'Bill payment does not belong to this Pocket account.', 403)
  return intent
}

function assertState(intent: PocketBillsIntent, allowed: PocketBillsIntentState[], action: string) {
  if (!allowed.includes(intent.state)) {
    throw new PocketBillsStoreError('BILLS_INVALID_STATE', `${action} is not available while this bill payment is ${intent.state}.`, 409)
  }
}

function publicIntent(intent: PocketBillsIntent): PublicPocketBillsIntent {
  const {
    ownerId: _ownerId,
    idempotencyKey: _idempotencyKey,
    requestFingerprint: _requestFingerprint,
    amountNgnMinor: _amountNgnMinor,
    refundIdempotencyKey: _refundIdempotencyKey,
    refundCircleTransactionId: _refundCircleTransactionId,
    refundCircleState: _refundCircleState,
    refundClaimedAt: _refundClaimedAt,
    refundSubmittedAt: _refundSubmittedAt,
    refundLastCheckedAt: _refundLastCheckedAt,
    ...safe
  } = intent
  return { ...safe }
}

export function publicPocketBillsIntent(intent: PocketBillsIntent) {
  return publicIntent(intent)
}

export function createPocketBillsStore(options: BillsStoreOptions) {
  const { config } = options
  const now = options.now ?? Date.now
  const uuid = options.uuid ?? randomUUID
  const storage: BillsStorage = options.storage ?? {
    ready: hasRenderDurableStore,
    read: readDurableJson,
    mutate: mutateDurableJson,
  }
  const storeKey = config.storeKey

  function requireStorage() {
    if (!storage.ready()) {
      throw new PocketBillsStoreError(
        'BILLS_STORAGE_NOT_CONFIGURED',
        'Durable Bills storage is not configured.',
        503,
      )
    }
  }

  async function mutate<T>(fn: (store: BillsStoreData) => T | Promise<T>) {
    requireStorage()
    let result!: T
    await storage.mutate<BillsStoreData>(storeKey, async current => {
      const store = normalizeStore(current)
      result = await fn(store)
      return store
    })
    return result
  }

  async function read() {
    requireStorage()
    return normalizeStore(await storage.read<BillsStoreData>(storeKey))
  }

  async function createQuote(input: {
    ownerId: string
    idempotencyKey: string
    serviceId: string
    serviceName: string
    phone: string
    amountNgn: string | number
    amountUsdc: string | number
    fxRateNgnPerUsdc: string | number
    payerWallet: string
    quoteExpiresAt: number
  }) {
    const ownerId = cleanText(input.ownerId, 200)
    const idempotencyKey = cleanText(input.idempotencyKey, 128)
    const serviceId = cleanText(input.serviceId, 40).toLowerCase()
    const serviceName = cleanText(input.serviceName, 100)
    const phone = cleanText(input.phone, 20).replace(/\D/g, '')
    const amountNgn = canonicalDecimal(input.amountNgn, 2, 'Naira amount')
    const amountNgnMinor = decimalToMinor(amountNgn, 2)
    const amountUsdc = canonicalDecimal(input.amountUsdc, 6, 'USDC amount')
    const fxRateNgnPerUsdc = canonicalDecimal(input.fxRateNgnPerUsdc, 6, 'FX rate')
    const payerWallet = cleanText(input.payerWallet, 80)
    const treasuryAddress = config.treasuryAddress
    const createdAt = now()
    const quoteExpiresAt = Number(input.quoteExpiresAt)

    if (!ownerId) throw new PocketBillsStoreError('BILLS_AUTH_REQUIRED', 'Pocket authentication is required.', 401)
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) throw new PocketBillsStoreError('BILLS_INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required.')
    if (!SERVICE_IDS.has(serviceId) || !serviceName) throw new PocketBillsStoreError('BILLS_INVALID_SERVICE', 'A supported Airtime network is required.')
    if (!/^0\d{10}$/.test(phone)) throw new PocketBillsStoreError('BILLS_INVALID_PHONE', 'Enter a valid Nigerian phone number.')
    if (!isAddress(payerWallet)) throw new PocketBillsStoreError('BILLS_INVALID_WALLET', 'Open a valid Base Circle wallet first.')
    if (!isAddress(treasuryAddress)) throw new PocketBillsStoreError('BILLS_POLICY_NOT_READY', 'Bills treasury is not configured.', 503)
    if (!Number.isFinite(quoteExpiresAt) || quoteExpiresAt <= createdAt || quoteExpiresAt - createdAt > MAX_QUOTE_LIFETIME_MS) {
      throw new PocketBillsStoreError('BILLS_INVALID_QUOTE_EXPIRY', 'Bill quote expiry is invalid.')
    }

    const amountMinor = BigInt(amountNgnMinor)
    const minimumMinor = policyMinor(config.minNgn, 'Minimum bill amount')
    const maximumMinor = policyMinor(config.maxNgn, 'Maximum bill amount')
    const dailyLimitMinor = policyMinor(config.dailyLimitNgn, 'Daily bill limit')
    if (amountMinor < minimumMinor) throw new PocketBillsStoreError('BILLS_AMOUNT_BELOW_LIMIT', `Minimum bill amount is NGN ${config.minNgn}.`)
    if (amountMinor > maximumMinor) throw new PocketBillsStoreError('BILLS_AMOUNT_ABOVE_LIMIT', `Maximum bill amount is NGN ${config.maxNgn}.`)

    // Idempotency follows the user's semantic request. Server-generated quote
    // values and expiry may drift between retries, but the original stored quote
    // must be replayed instead of producing a conflict or a second intent.
    const fingerprint = JSON.stringify({ serviceId, phone, amountNgn, payerWallet: payerWallet.toLowerCase() })
    return mutate(store => {
      const index = idempotencyIndex(ownerId, idempotencyKey)
      const existingId = store.idempotency[index]
      const existing = existingId ? store.intents[existingId] : undefined
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new PocketBillsStoreError('BILLS_IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to a different bill request.', 409)
        }
        return { intent: existing, created: false }
      }

      const day = lagosDay(createdAt)
      const reserved = Object.values(store.intents).reduce((total, intent) => {
        if (intent.ownerId !== ownerId || lagosDay(intent.createdAt) !== day) return total
        const abandoned = ['quoted', 'awaiting_payment'].includes(intent.state) && intent.quoteExpiresAt <= createdAt
        const released = intent.state === 'failed' || intent.state === 'refunded'
        return abandoned || released ? total : total + BigInt(intent.amountNgnMinor)
      }, 0n)
      if (reserved + amountMinor > dailyLimitMinor) {
        throw new PocketBillsStoreError('BILLS_DAILY_LIMIT_EXCEEDED', 'Daily bill-payment limit reached.', 409)
      }

      const id = uuid()
      const requestId = createVtpassRequestId(new Date(createdAt), id)
      const intent: PocketBillsIntent = {
        id,
        ownerId,
        idempotencyKey,
        requestFingerprint: fingerprint,
        requestId,
        state: 'quoted',
        category: 'airtime',
        serviceId,
        serviceName,
        phone,
        amountNgn,
        amountNgnMinor,
        amountUsdc,
        fxRateNgnPerUsdc,
        network: 'base',
        treasuryAddress,
        payerWallet,
        quoteExpiresAt,
        txHash: '',
        paymentAmountUsdc: '',
        providerCode: '',
        providerStatus: '',
        providerEnvironment: config.environment,
        providerTransactionId: '',
        providerDescription: '',
        providerAttemptedAt: 0,
        requeryAttempts: 0,
        lastRequeryAt: 0,
        refundTxHash: '',
        refundIdempotencyKey: '',
        refundCircleTransactionId: '',
        refundCircleState: '',
        refundClaimedAt: 0,
        refundSubmittedAt: 0,
        refundConfirmedAt: 0,
        refundLastCheckedAt: 0,
        failureReason: '',
        createdAt,
        updatedAt: createdAt,
      }
      store.intents[id] = intent
      store.idempotency[index] = id
      return { intent, created: true }
    })
  }

  async function getOwnedIntent(ownerId: string, intentId: string) {
    const store = await read()
    return assertOwner(store.intents[cleanText(intentId, 100)], cleanText(ownerId, 200))
  }

  async function listOwnedIntents(ownerIdInput: string, limit = 50) {
    const ownerId = cleanText(ownerIdInput, 200)
    if (!ownerId) throw new PocketBillsStoreError('BILLS_AUTH_REQUIRED', 'Pocket authentication is required.', 401)
    let store = await read()
    // Persist the pilot environment on legacy records once, so their receipt
    // wording cannot change when the provider is later switched to live.
    if (Object.values(store.intents).some(intent => !['sandbox', 'live'].includes(intent.providerEnvironment))) {
      store = await mutate(current => {
        for (const intent of Object.values(current.intents)) {
          if (!['sandbox', 'live'].includes(intent.providerEnvironment)) intent.providerEnvironment = config.environment
        }
        return current
      })
    }
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50
    return Object.values(store.intents)
      .filter(intent => intent.ownerId === ownerId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, safeLimit)
  }

  async function updateOwned(ownerIdInput: string, intentIdInput: string, fn: (intent: PocketBillsIntent, store: BillsStoreData, timestamp: number) => void) {
    const ownerId = cleanText(ownerIdInput, 200)
    const intentId = cleanText(intentIdInput, 100)
    return mutate(store => {
      const intent = assertOwner(store.intents[intentId], ownerId)
      const timestamp = now()
      fn(intent, store, timestamp)
      intent.updatedAt = timestamp
      return intent
    })
  }

  async function markAwaitingPayment(ownerId: string, intentId: string) {
    return updateOwned(ownerId, intentId, (intent, _store, timestamp) => {
      if (intent.state === 'awaiting_payment') return
      assertState(intent, ['quoted'], 'Payment authorization')
      if (intent.quoteExpiresAt <= timestamp) throw new PocketBillsStoreError('BILLS_QUOTE_EXPIRED', 'Bill quote expired. Request a new quote.', 409)
      intent.state = 'awaiting_payment'
    })
  }

  async function recordVerifiedPayment(input: { ownerId: string; intentId: string; txHash: string; paymentAmountUsdc?: string; confirmedAt?: string | number }) {
    const txHash = cleanText(input.txHash, 80).toLowerCase()
    if (!EVM_TX_PATTERN.test(txHash)) throw new PocketBillsStoreError('BILLS_INVALID_TX_HASH', 'A valid Base transaction hash is required.')
    const confirmedAt = input.confirmedAt === undefined
      ? null
      : typeof input.confirmedAt === 'number'
        ? input.confirmedAt
        : Date.parse(input.confirmedAt)
    if (confirmedAt !== null && !Number.isFinite(confirmedAt)) {
      throw new PocketBillsStoreError('BILLS_INVALID_CONFIRMATION_TIME', 'Payment confirmation time is invalid.')
    }
    return updateOwned(input.ownerId, input.intentId, (intent, store, timestamp) => {
      if (intent.txHash === txHash && ['payment_confirmed', 'vending', 'pending', 'delivered', 'refund_pending', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(intent.state)) return
      assertState(intent, ['quoted', 'awaiting_payment'], 'Payment confirmation')
      // A delayed callback/retry is valid when the chain proves that the transfer
      // itself confirmed inside the quote window. Direct callers without that
      // proof still fail closed at the current time.
      const effectiveConfirmationTime = confirmedAt ?? timestamp
      if (effectiveConfirmationTime < intent.createdAt || effectiveConfirmationTime > intent.quoteExpiresAt) {
        throw new PocketBillsStoreError('BILLS_QUOTE_EXPIRED', 'Bill quote expired before payment confirmation.', 409)
      }
      const claimedBy = store.transactionHashes[txHash]
      if (claimedBy && claimedBy !== intent.id) {
        throw new PocketBillsStoreError('BILLS_TX_HASH_REUSED', 'This transaction is already connected to another bill payment.', 409)
      }
      store.transactionHashes[txHash] = intent.id
      intent.txHash = txHash
      const paymentAmountUsdc = input.paymentAmountUsdc
        ? canonicalDecimal(input.paymentAmountUsdc, 6, 'Verified USDC amount')
        : intent.amountUsdc
      if (BigInt(decimalToMinor(paymentAmountUsdc, 6)) < BigInt(decimalToMinor(intent.amountUsdc, 6))) {
        throw new PocketBillsStoreError('BILLS_PAYMENT_AMOUNT_MISMATCH', 'Verified USDC amount is below the bill quote.', 409)
      }
      intent.paymentAmountUsdc = paymentAmountUsdc
      intent.state = 'payment_confirmed'
    })
  }

  async function backfillVerifiedPaymentAmount(input: { ownerId: string; intentId: string; txHash: string; paymentAmountUsdc: string }) {
    const txHash = cleanText(input.txHash, 80).toLowerCase()
    if (!EVM_TX_PATTERN.test(txHash)) throw new PocketBillsStoreError('BILLS_INVALID_TX_HASH', 'A valid Base transaction hash is required.')
    const paymentAmountUsdc = canonicalDecimal(input.paymentAmountUsdc, 6, 'Verified USDC amount')
    return updateOwned(input.ownerId, input.intentId, (intent, store) => {
      assertState(intent, ['payment_confirmed', 'vending', 'pending', 'delivered', 'refund_pending', 'needs_review'], 'Payment evidence backfill')
      if (intent.txHash !== txHash) throw new PocketBillsStoreError('BILLS_TX_HASH_MISMATCH', 'Payment evidence does not match this bill payment.', 409)
      if (BigInt(decimalToMinor(paymentAmountUsdc, 6)) < BigInt(decimalToMinor(intent.amountUsdc, 6))) {
        throw new PocketBillsStoreError('BILLS_PAYMENT_AMOUNT_MISMATCH', 'Verified USDC amount is below the bill quote.', 409)
      }
      if (intent.paymentAmountUsdc && intent.paymentAmountUsdc !== paymentAmountUsdc) {
        throw new PocketBillsStoreError('BILLS_PAYMENT_AMOUNT_MISMATCH', 'Stored and verified USDC amounts do not match.', 409)
      }
      const claimedBy = store.transactionHashes[txHash]
      if (claimedBy && claimedBy !== intent.id) throw new PocketBillsStoreError('BILLS_TX_HASH_REUSED', 'This transaction is already connected to another bill payment.', 409)
      store.transactionHashes[txHash] = intent.id
      intent.paymentAmountUsdc = paymentAmountUsdc
    })
  }

  async function claimVending(ownerId: string, intentId: string) {
    const cleanOwnerId = cleanText(ownerId, 200)
    const cleanIntentId = cleanText(intentId, 100)
    return mutate(store => {
      const intent = assertOwner(store.intents[cleanIntentId], cleanOwnerId)
      if (['vending', 'pending', 'delivered', 'refund_pending', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(intent.state)) {
        return { intent, claimed: false }
      }
      assertState(intent, ['payment_confirmed'], 'Bill vending')
      if (!intent.txHash) throw new PocketBillsStoreError('BILLS_PAYMENT_NOT_CONFIRMED', 'On-chain payment is not confirmed.', 409)
      const timestamp = now()
      intent.state = 'vending'
      intent.providerAttemptedAt = timestamp
      intent.updatedAt = timestamp
      return { intent, claimed: true }
    })
  }

  async function recordProviderResult(ownerId: string, intentId: string, result: VtpassTransactionResult, options: { requery?: boolean } = {}) {
    return updateOwned(ownerId, intentId, (intent, store, timestamp) => {
      assertState(intent, ['vending', 'pending', 'delivered', 'needs_review'], 'Provider reconciliation')
      if (result.requestId && result.requestId !== intent.requestId) {
        throw new PocketBillsStoreError('BILLS_PROVIDER_MISMATCH', 'Provider result does not match this bill request.', 409)
      }
      if (result.recipient && result.recipient.replace(/\D/g, '') !== intent.phone) {
        throw new PocketBillsStoreError('BILLS_PROVIDER_MISMATCH', 'Provider result recipient does not match this bill request.', 409)
      }
      if (result.amountNgn !== null && BigInt(Math.round(result.amountNgn * 100)) !== BigInt(intent.amountNgnMinor)) {
        throw new PocketBillsStoreError('BILLS_PROVIDER_MISMATCH', 'Provider result amount does not match this bill request.', 409)
      }
      const providerTransactionId = cleanText(result.transactionId, 120)
      const existingIntentId = providerTransactionId ? store.providerTransactions[providerTransactionId] : ''
      if (existingIntentId && existingIntentId !== intent.id) {
        throw new PocketBillsStoreError('BILLS_PROVIDER_TX_REUSED', 'Provider transaction is already connected to another bill payment.', 409)
      }
      if (intent.state === 'delivered' && result.status !== 'reversed') {
        // Never downgrade a delivered bill or overwrite its confirmed provider
        // metadata on a later inconclusive or failed read.
        return
      }
      intent.providerCode = cleanText(result.providerCode, 40)
      intent.providerStatus = cleanText(result.providerStatus, 40)
      intent.providerTransactionId = providerTransactionId
      intent.providerDescription = cleanText(result.responseDescription, 180)
      if (options.requery) {
        intent.requeryAttempts += 1
        intent.lastRequeryAt = timestamp
      }
      if (providerTransactionId) store.providerTransactions[providerTransactionId] = intent.id
      if (result.status === 'delivered') intent.state = 'delivered'
      else if (result.status === 'pending') intent.state = 'pending'
      else if (result.status === 'failed' || result.status === 'reversed') intent.state = 'refund_pending'
    })
  }

  async function recordRequeryFailure(ownerId: string, intentId: string, reason: string) {
    return updateOwned(ownerId, intentId, (intent, _store, timestamp) => {
      assertState(intent, ['vending', 'pending', 'delivered', 'needs_review'], 'Provider reconciliation')
      intent.requeryAttempts += 1
      intent.lastRequeryAt = timestamp
      intent.failureReason = cleanText(reason, 240) || 'Provider status could not be refreshed.'
      if (intent.state !== 'delivered' && intent.requeryAttempts >= 8) intent.state = 'needs_review'
    })
  }

  async function markNeedsReview(ownerId: string, intentId: string, reason: string) {
    return updateOwned(ownerId, intentId, intent => {
      assertState(intent, ['payment_confirmed', 'vending', 'pending', 'refund_pending', 'refunding', 'refund_submitted'], 'Manual review')
      intent.failureReason = cleanText(reason, 240) || 'Bill payment needs reconciliation.'
      intent.state = 'needs_review'
    })
  }

  async function failBeforePayment(ownerId: string, intentId: string, reason: string) {
    return updateOwned(ownerId, intentId, intent => {
      assertState(intent, ['quoted', 'awaiting_payment'], 'Bill cancellation')
      intent.failureReason = cleanText(reason, 240) || 'Bill payment was cancelled.'
      intent.state = 'failed'
    })
  }

  async function markRefundSubmitted(input: { ownerId: string; intentId: string; refundTxHash: string }) {
    const refundTxHash = cleanText(input.refundTxHash, 80).toLowerCase()
    if (!EVM_TX_PATTERN.test(refundTxHash)) throw new PocketBillsStoreError('BILLS_INVALID_REFUND_TX_HASH', 'A valid refund transaction hash is required.')
    return updateOwned(input.ownerId, input.intentId, (intent, store) => {
      assertState(intent, ['refund_pending', 'refunding', 'refund_submitted', 'needs_review'], 'Refund submission')
      if (refundTxHash === intent.txHash) throw new PocketBillsStoreError('BILLS_TX_HASH_REUSED', 'Refund transaction must differ from the original payment.', 409)
      const claimedBy = store.transactionHashes[refundTxHash]
      if (claimedBy && claimedBy !== intent.id) throw new PocketBillsStoreError('BILLS_TX_HASH_REUSED', 'This transaction is already connected to another bill payment.', 409)
      store.transactionHashes[refundTxHash] = intent.id
      intent.refundTxHash = refundTxHash
      intent.state = 'refund_submitted'
    })
  }

  async function getIntentById(intentIdInput: string) {
    const store = await read()
    const intent = store.intents[cleanText(intentIdInput, 100)]
    if (!intent) throw new PocketBillsStoreError('BILLS_NOT_FOUND', 'Bill payment was not found.', 404)
    return intent
  }

  async function claimRefund(input: { intentId: string; treasuryAddress: string; leaseMs?: number }) {
    const intentId = cleanText(input.intentId, 100)
    const treasuryAddress = cleanText(input.treasuryAddress, 80)
    const leaseMs = Math.max(30_000, Math.min(Number(input.leaseMs) || 120_000, 10 * 60_000))
    return mutate(store => {
      const intent = store.intents[intentId]
      if (!intent) throw new PocketBillsStoreError('BILLS_NOT_FOUND', 'Bill payment was not found.', 404)
      if (!isAddress(treasuryAddress) || intent.treasuryAddress.toLowerCase() !== treasuryAddress.toLowerCase()) {
        throw new PocketBillsStoreError('BILLS_REFUND_TREASURY_MISMATCH', 'Bill payment does not belong to the configured Circle treasury.', 409)
      }
      if (!intent.txHash || !isAddress(intent.payerWallet)) {
        throw new PocketBillsStoreError('BILLS_REFUND_PAYMENT_INVALID', 'Original bill payment is incomplete.', 409)
      }
      if (['refund_submitted', 'refunded'].includes(intent.state)) return { intent, claimed: false }
      const timestamp = now()
      if (intent.state === 'refunding') {
        const claimedAt = Number(intent.refundClaimedAt) || 0
        if (claimedAt > 0 && timestamp - claimedAt < leaseMs) return { intent, claimed: false }
      } else {
        assertState(intent, ['refund_pending'], 'Refund claim')
      }
      const idempotencyKey = cleanText(intent.refundIdempotencyKey, 80) || uuid()
      if (!UUID_V4_PATTERN.test(idempotencyKey)) {
        throw new PocketBillsStoreError('BILLS_REFUND_IDEMPOTENCY_INVALID', 'Refund idempotency key is invalid.', 500)
      }
      intent.refundIdempotencyKey = idempotencyKey
      intent.refundClaimedAt = timestamp
      intent.refundCircleState = intent.refundCircleState || 'INITIATED'
      intent.state = 'refunding'
      intent.updatedAt = timestamp
      return { intent, claimed: true }
    })
  }

  async function recordCircleRefundSubmission(input: { intentId: string; circleTransactionId: string }) {
    const circleTransactionId = cleanText(input.circleTransactionId, 80)
    if (!UUID_PATTERN.test(circleTransactionId)) {
      throw new PocketBillsStoreError('BILLS_REFUND_CIRCLE_TX_INVALID', 'Circle refund transaction ID is invalid.', 502)
    }
    return mutate(store => {
      const intent = store.intents[cleanText(input.intentId, 100)]
      if (!intent) throw new PocketBillsStoreError('BILLS_NOT_FOUND', 'Bill payment was not found.', 404)
      assertState(intent, ['refunding', 'refund_submitted'], 'Circle refund submission')
      if (intent.refundCircleTransactionId && intent.refundCircleTransactionId !== circleTransactionId) {
        throw new PocketBillsStoreError('BILLS_REFUND_CIRCLE_TX_MISMATCH', 'A different Circle refund transaction is already connected.', 409)
      }
      const timestamp = now()
      intent.refundCircleTransactionId = circleTransactionId
      intent.refundCircleState = intent.refundCircleState || 'INITIATED'
      intent.refundSubmittedAt = intent.refundSubmittedAt || timestamp
      intent.state = 'refund_submitted'
      intent.updatedAt = timestamp
      return intent
    })
  }

  async function recordCircleRefundStatus(input: { intentId: string; circleState: string; refundTxHash?: string }) {
    const circleState = cleanText(input.circleState, 40).toUpperCase()
    if (!circleState) throw new PocketBillsStoreError('BILLS_REFUND_CIRCLE_STATE_INVALID', 'Circle refund state is invalid.', 502)
    const refundTxHash = cleanText(input.refundTxHash, 80).toLowerCase()
    if (refundTxHash && !EVM_TX_PATTERN.test(refundTxHash)) {
      throw new PocketBillsStoreError('BILLS_INVALID_REFUND_TX_HASH', 'Circle returned an invalid refund transaction hash.', 502)
    }
    return mutate(store => {
      const intent = store.intents[cleanText(input.intentId, 100)]
      if (!intent) throw new PocketBillsStoreError('BILLS_NOT_FOUND', 'Bill payment was not found.', 404)
      assertState(intent, ['refunding', 'refund_submitted'], 'Circle refund reconciliation')
      const timestamp = now()
      intent.refundCircleState = circleState
      intent.refundLastCheckedAt = timestamp
      if (refundTxHash) {
        if (refundTxHash === intent.txHash) throw new PocketBillsStoreError('BILLS_TX_HASH_REUSED', 'Refund transaction must differ from the original payment.', 409)
        const claimedBy = store.transactionHashes[refundTxHash]
        if (claimedBy && claimedBy !== intent.id) throw new PocketBillsStoreError('BILLS_TX_HASH_REUSED', 'This transaction is already connected to another bill payment.', 409)
        store.transactionHashes[refundTxHash] = intent.id
        intent.refundTxHash = refundTxHash
      }
      intent.state = 'refund_submitted'
      intent.updatedAt = timestamp
      return intent
    })
  }

  async function markRefunded(ownerId: string, intentId: string) {
    return updateOwned(ownerId, intentId, intent => {
      assertState(intent, ['refund_submitted'], 'Refund confirmation')
      if (!intent.refundTxHash) throw new PocketBillsStoreError('BILLS_REFUND_NOT_SUBMITTED', 'Refund transaction is not available.', 409)
      intent.refundConfirmedAt = now()
      intent.state = 'refunded'
    })
  }

  return {
    createQuote,
    getOwnedIntent,
    listOwnedIntents,
    getIntentById,
    markAwaitingPayment,
    recordVerifiedPayment,
    backfillVerifiedPaymentAmount,
    claimVending,
    recordProviderResult,
    recordRequeryFailure,
    markNeedsReview,
    failBeforePayment,
    markRefundSubmitted,
    claimRefund,
    recordCircleRefundSubmission,
    recordCircleRefundStatus,
    markRefunded,
  }
}

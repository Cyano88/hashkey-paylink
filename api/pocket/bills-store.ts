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
  | 'provider_failed_unverified'
  | 'refund_pending'
  | 'refund_eligible'
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
  category: 'airtime' | 'data' | 'tv' | 'electricity'
  serviceId: string
  serviceName: string
  variationCode: string
  variationName: string
  phone: string
  contactPhone: string
  customerName: string
  customerAddress: string
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
  purchasedCode: string
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
  providerRequests: Record<string, string>
  providerRequeryClaims: Record<string, { claimedAt: number }>
  mutationLimits: Record<string, { count: number; resetAt: number }>
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

const AIRTIME_SERVICE_IDS = new Set(['mtn', 'airtel', 'glo', 'etisalat', '9mobile'])
const DATA_SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{16,128}$/
const EVM_TX_PATTERN = /^0x[a-fA-F0-9]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_QUOTE_LIFETIME_MS = 15 * 60_000
export const POCKET_BILLS_CONFIRMATION_GRACE_MS = 5 * 60_000

function emptyStore(): BillsStoreData {
  return {
    version: 1,
    intents: {},
    idempotency: {},
    transactionHashes: {},
    providerTransactions: {},
    providerRequests: {},
    providerRequeryClaims: {},
    mutationLimits: {},
  }
}

function normalizeStore(value: unknown): BillsStoreData {
  if (!value || typeof value !== 'object') return emptyStore()
  const current = value as Partial<BillsStoreData>
  return {
    version: 1,
    intents: current.intents && typeof current.intents === 'object'
      ? Object.fromEntries(Object.entries(current.intents).map(([id, stored]) => {
          const intent = stored as PocketBillsIntent
          return [id, {
            ...intent,
            category: ['airtime', 'data', 'tv', 'electricity'].includes(intent.category) ? intent.category : 'airtime',
            variationCode: cleanText(intent.variationCode, 100),
            variationName: cleanText(intent.variationName, 140),
            contactPhone: cleanText(intent.contactPhone, 20).replace(/\D/g, ''),
            customerName: cleanText(intent.customerName, 140),
            customerAddress: cleanText(intent.customerAddress, 220),
            purchasedCode: cleanText(intent.purchasedCode, 4000),
          }]
        }))
      : {},
    idempotency: current.idempotency && typeof current.idempotency === 'object' ? current.idempotency : {},
    transactionHashes: current.transactionHashes && typeof current.transactionHashes === 'object' ? current.transactionHashes : {},
    providerTransactions: current.providerTransactions && typeof current.providerTransactions === 'object' ? current.providerTransactions : {},
    providerRequests: current.providerRequests && typeof current.providerRequests === 'object' ? current.providerRequests : {},
    providerRequeryClaims: current.providerRequeryClaims && typeof current.providerRequeryClaims === 'object' ? current.providerRequeryClaims : {},
    mutationLimits: current.mutationLimits && typeof current.mutationLimits === 'object' ? current.mutationLimits : {},
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

  async function consumeMutationLimit(input: { ownerId: string; action: string; windowMs: number; max: number }) {
    const ownerId = cleanText(input.ownerId, 200)
    const action = cleanText(input.action, 40).toLowerCase()
    const windowMs = Math.max(10_000, Math.min(Math.floor(input.windowMs), 60 * 60_000))
    const max = Math.max(1, Math.min(Math.floor(input.max), 500))
    if (!ownerId) throw new PocketBillsStoreError('BILLS_AUTH_REQUIRED', 'Pocket authentication is required.', 401)
    if (!/^[a-z0-9:_-]{2,40}$/.test(action)) throw new PocketBillsStoreError('BILLS_RATE_LIMIT_INVALID', 'Bills rate-limit action is invalid.', 500)
    return mutate(store => {
      const timestamp = now()
      const key = `${ownerId}:${action}`
      const current = store.mutationLimits[key]
      if (!current || current.resetAt <= timestamp) {
        store.mutationLimits[key] = { count: 1, resetAt: timestamp + windowMs }
        return { remaining: max - 1, resetAt: timestamp + windowMs }
      }
      if (current.count >= max) {
        throw new PocketBillsStoreError('BILLS_RATE_LIMITED', 'Too many Bills requests. Try again shortly.', 429)
      }
      current.count += 1
      if (Object.keys(store.mutationLimits).length > 2_000) {
        for (const [limitKey, value] of Object.entries(store.mutationLimits)) {
          if (value.resetAt <= timestamp) delete store.mutationLimits[limitKey]
        }
      }
      return { remaining: max - current.count, resetAt: current.resetAt }
    })
  }

  async function createQuote(input: {
    ownerId: string
    idempotencyKey: string
    category?: 'airtime' | 'data' | 'tv' | 'electricity'
    serviceId: string
    serviceName: string
    variationCode?: string
    variationName?: string
    phone: string
    contactPhone?: string
    customerName?: string
    customerAddress?: string
    amountNgn: string | number
    amountUsdc: string | number
    fxRateNgnPerUsdc: string | number
    payerWallet: string
    quoteExpiresAt: number
  }) {
    const ownerId = cleanText(input.ownerId, 200)
    const idempotencyKey = cleanText(input.idempotencyKey, 128)
    const category = ['data', 'tv', 'electricity'].includes(String(input.category)) ? input.category as 'data' | 'tv' | 'electricity' : 'airtime'
    const serviceId = cleanText(input.serviceId, 40).toLowerCase()
    const serviceName = cleanText(input.serviceName, 100)
    const variationCode = cleanText(input.variationCode, 100)
    const variationName = cleanText(input.variationName, 140)
    const phone = cleanText(input.phone, 20).replace(/\D/g, '')
    const contactPhone = cleanText(input.contactPhone, 20).replace(/\D/g, '')
    const customerName = cleanText(input.customerName, 140)
    const customerAddress = cleanText(input.customerAddress, 220)
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
    // Data IDs are accepted only after the authenticated request handler has
    // matched them against VTpass's current provider catalog.
    const supportedService = category === 'airtime' ? AIRTIME_SERVICE_IDS.has(serviceId) : DATA_SERVICE_ID_PATTERN.test(serviceId)
    if (!supportedService || !serviceName) throw new PocketBillsStoreError('BILLS_INVALID_SERVICE', `A supported ${category} provider is required.`)
    if (category !== 'airtime' && (!/^[a-zA-Z0-9._-]{1,100}$/.test(variationCode) || !variationName)) {
      throw new PocketBillsStoreError('BILLS_INVALID_VARIATION', `A valid ${category === 'electricity' ? 'meter type' : 'plan'} is required.`)
    }
    const validRecipient = category === 'airtime' ? /^0\d{10}$/.test(phone) : category === 'data' ? /^\d{10,12}$/.test(phone) : /^\d{8,15}$/.test(phone)
    if (!validRecipient) {
      throw new PocketBillsStoreError('BILLS_INVALID_PHONE', category === 'tv' ? 'Enter a valid smartcard number.' : category === 'electricity' ? 'Enter a valid meter number.' : category === 'data' ? 'Enter a valid Data recipient.' : 'Enter a valid Nigerian phone number.')
    }
    if ((category === 'tv' || category === 'electricity') && (!/^0\d{10}$/.test(contactPhone) || !customerName)) {
      throw new PocketBillsStoreError('BILLS_CUSTOMER_NOT_VERIFIED', 'Verify the customer account before payment.')
    }
    if (!isAddress(payerWallet)) throw new PocketBillsStoreError('BILLS_INVALID_WALLET', 'Open a valid Base Circle wallet first.')
    if (!isAddress(treasuryAddress)) throw new PocketBillsStoreError('BILLS_POLICY_NOT_READY', 'Bills treasury is not configured.', 503)
    if (!Number.isFinite(quoteExpiresAt) || quoteExpiresAt <= createdAt || quoteExpiresAt - createdAt > MAX_QUOTE_LIFETIME_MS) {
      throw new PocketBillsStoreError('BILLS_INVALID_QUOTE_EXPIRY', 'Bill quote expiry is invalid.')
    }

    const amountMinor = BigInt(amountNgnMinor)
    if (amountMinor <= 0n) throw new PocketBillsStoreError('BILLS_INVALID_AMOUNT', 'Enter a valid Naira amount.')

    // Idempotency follows the user's semantic request. Server-generated quote
    // values and expiry may drift between retries, but the original stored quote
    // must be replayed instead of producing a conflict or a second intent.
    const fingerprint = JSON.stringify({ category, serviceId, variationCode, phone, contactPhone, amountNgn, payerWallet: payerWallet.toLowerCase() })
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

      const id = uuid()
      const requestId = createVtpassRequestId(new Date(createdAt), id)
      const intent: PocketBillsIntent = {
        id,
        ownerId,
        idempotencyKey,
        requestFingerprint: fingerprint,
        requestId,
        state: 'quoted',
        category,
        serviceId,
        serviceName,
        variationCode,
        variationName,
        phone,
        contactPhone,
        customerName,
        customerAddress,
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
        purchasedCode: '',
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
      store.providerRequests[requestId] = id
      return { intent, created: true }
    })
  }

  async function claimProviderRequeryByRequestId(input: { requestId: string; cooldownMs?: number; leaseMs?: number }) {
    const requestId = cleanText(input.requestId, 60)
    const cooldownMs = Math.max(5_000, Math.min(Number(input.cooldownMs) || 15_000, 5 * 60_000))
    const leaseMs = Math.max(15_000, Math.min(Number(input.leaseMs) || 60_000, 5 * 60_000))
    return mutate(store => {
      let intentId = store.providerRequests[requestId]
      let intent = intentId ? store.intents[intentId] : undefined
      if (!intent) {
        intent = Object.values(store.intents).find(item => item.requestId === requestId)
        intentId = intent?.id
        if (intentId) store.providerRequests[requestId] = intentId
      }
      if (!intent) return { intent: undefined, claimed: false, reason: 'not_found' as const }
      if (!['vending', 'pending', 'delivered', 'provider_failed_unverified', 'refund_eligible', 'needs_review'].includes(intent.state)) {
        return { intent, claimed: false, reason: 'ineligible' as const }
      }
      const timestamp = now()
      const currentClaim = store.providerRequeryClaims[requestId]
      if (currentClaim && timestamp - currentClaim.claimedAt < leaseMs) {
        return { intent, claimed: false, reason: 'in_progress' as const }
      }
      if (intent.lastRequeryAt > 0 && timestamp - intent.lastRequeryAt < cooldownMs) {
        return { intent, claimed: false, reason: 'cooldown' as const }
      }
      store.providerRequeryClaims[requestId] = { claimedAt: timestamp }
      return { intent, claimed: true, reason: 'claimed' as const }
    })
  }

  async function releaseProviderRequeryClaim(requestIdInput: string) {
    const requestId = cleanText(requestIdInput, 60)
    return mutate(store => {
      delete store.providerRequeryClaims[requestId]
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
      if (intent.txHash === txHash && ['payment_confirmed', 'vending', 'pending', 'delivered', 'provider_failed_unverified', 'refund_pending', 'refund_eligible', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(intent.state)) return
      assertState(intent, ['quoted', 'awaiting_payment'], 'Payment confirmation')
      // Payment authorization must begin before quote expiry. Once authorized,
      // Base may mine the transfer shortly after that deadline, so confirmation
      // receives a separate bounded grace period. This prevents a successful
      // transfer from becoming untracked solely because block production was slow.
      // Direct callers without chain confirmation proof still fail closed.
      const effectiveConfirmationTime = confirmedAt ?? timestamp
      const confirmationDeadline = intent.quoteExpiresAt + (confirmedAt === null ? 0 : POCKET_BILLS_CONFIRMATION_GRACE_MS)
      if (effectiveConfirmationTime < intent.createdAt || effectiveConfirmationTime > confirmationDeadline) {
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
      assertState(intent, ['payment_confirmed', 'vending', 'pending', 'delivered', 'provider_failed_unverified', 'refund_pending', 'refund_eligible', 'needs_review'], 'Payment evidence backfill')
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
      if (['vending', 'pending', 'delivered', 'provider_failed_unverified', 'refund_pending', 'refund_eligible', 'refunding', 'refund_submitted', 'refunded', 'needs_review'].includes(intent.state)) {
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
      assertState(intent, ['vending', 'pending', 'delivered', 'provider_failed_unverified', 'refund_eligible', 'refunding', 'needs_review'], 'Provider reconciliation')
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
      const purchasedCode = cleanText(result.purchasedCode, 4000)
      const existingIntentId = providerTransactionId ? store.providerTransactions[providerTransactionId] : ''
      if (existingIntentId && existingIntentId !== intent.id) {
        throw new PocketBillsStoreError('BILLS_PROVIDER_TX_REUSED', 'Provider transaction is already connected to another bill payment.', 409)
      }
      if (intent.state === 'delivered' && result.status !== 'reversed') {
        // Never downgrade a delivered bill or overwrite its confirmed provider
        // metadata on a later inconclusive or failed read. A later authoritative
        // requery may enrich a delivered prepaid receipt with its missing token.
        if (!intent.purchasedCode && purchasedCode) intent.purchasedCode = purchasedCode
        if (options.requery) {
          intent.requeryAttempts += 1
          intent.lastRequeryAt = timestamp
        }
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
      if (result.status === 'delivered') {
        intent.state = 'delivered'
        if (purchasedCode) intent.purchasedCode = purchasedCode
      }
      else if (result.status === 'pending') intent.state = 'pending'
      else if (result.status === 'failed' || result.status === 'reversed') {
        intent.state = options.requery
          ? intent.state === 'refunding' ? 'refunding' : 'refund_eligible'
          : 'provider_failed_unverified'
      }
    })
  }

  async function recordRequeryFailure(ownerId: string, intentId: string, reason: string) {
    return updateOwned(ownerId, intentId, (intent, _store, timestamp) => {
      assertState(intent, ['vending', 'pending', 'delivered', 'provider_failed_unverified', 'refund_eligible', 'needs_review'], 'Provider reconciliation')
      intent.requeryAttempts += 1
      intent.lastRequeryAt = timestamp
      intent.failureReason = cleanText(reason, 240) || 'Provider status could not be refreshed.'
      if (intent.state !== 'delivered' && intent.requeryAttempts >= 8) intent.state = 'needs_review'
    })
  }

  async function markNeedsReview(ownerId: string, intentId: string, reason: string) {
    return updateOwned(ownerId, intentId, intent => {
      assertState(intent, ['payment_confirmed', 'vending', 'pending', 'provider_failed_unverified', 'refund_pending', 'refund_eligible', 'refunding', 'refund_submitted'], 'Manual review')
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
      assertState(intent, ['refund_pending', 'refund_eligible', 'refunding', 'refund_submitted', 'needs_review'], 'Refund submission')
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
        assertState(intent, ['refund_eligible'], 'Refund claim')
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

  async function releaseRefundClaim(input: { ownerId: string; intentId: string; reason: string }) {
    return updateOwned(input.ownerId, input.intentId, intent => {
      assertState(intent, ['refunding'], 'Refund verification release')
      if (intent.refundCircleTransactionId) {
        throw new PocketBillsStoreError('BILLS_REFUND_ALREADY_SUBMITTED', 'Refund submission already exists.', 409)
      }
      intent.state = 'refund_eligible'
      intent.refundClaimedAt = 0
      intent.failureReason = cleanText(input.reason, 240) || 'VTpass refund eligibility could not be refreshed.'
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
    consumeMutationLimit,
    claimProviderRequeryByRequestId,
    releaseProviderRequeryClaim,
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
    releaseRefundClaim,
    recordCircleRefundSubmission,
    recordCircleRefundStatus,
    markRefunded,
  }
}

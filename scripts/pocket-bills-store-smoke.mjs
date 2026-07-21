import assert from 'node:assert/strict'
import {
  PocketBillsStoreError,
  createPocketBillsStore,
  publicPocketBillsIntent,
} from '../api/pocket/bills-store.ts'
import { readVtpassPhase0Config } from '../api/vtpass-config.ts'

const env = {
  VTPASS_ENVIRONMENT: 'sandbox',
  VTPASS_API_BASE: 'https://sandbox.vtpass.com',
  VTPASS_API_KEY: 'static-api-key',
  VTPASS_PUBLIC_KEY: 'PK_public',
  VTPASS_SECRET_KEY: 'SK_secret',
  POCKET_BILLS_ENABLED: 'false',
  VTPASS_SANDBOX_VENDING_ENABLED: 'false',
  VTPASS_LIVE_VENDING_ENABLED: 'false',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'false',
  POCKET_BILLS_TREASURY_ADDRESS: '0x1111111111111111111111111111111111111111',
  POCKET_BILLS_MIN_NGN: '100',
  POCKET_BILLS_MAX_NGN: '1000',
  POCKET_BILLS_DAILY_LIMIT_NGN: '10000',
  VTPASS_MINIMUM_WALLET_BALANCE_NGN: '5000',
  POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:test',
}

function memoryStorage() {
  let value
  let queue = Promise.resolve()
  return {
    ready: () => true,
    async read() {
      return value === undefined ? undefined : structuredClone(value)
    },
    async mutate(_key, fn) {
      let release
      const previous = queue
      queue = new Promise(resolve => { release = resolve })
      await previous
      try {
        value = structuredClone(await fn(value === undefined ? undefined : structuredClone(value)))
        return structuredClone(value)
      } finally {
        release()
      }
    },
    unsafeUpdate(fn) {
      value = structuredClone(fn(structuredClone(value)))
    },
  }
}

let currentTime = Date.parse('2026-07-19T12:00:00.000Z')
let uuidCounter = 0
const nextUuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`
const config = readVtpassPhase0Config(env)
const storage = memoryStorage()
const store = createPocketBillsStore({ config, storage, now: () => currentTime, uuid: nextUuid })

function quoteInput(overrides = {}) {
  return {
    ownerId: 'privy:owner-1',
    idempotencyKey: `bill:${String(uuidCounter + 1).padStart(20, '0')}`,
    serviceId: 'mtn',
    serviceName: 'MTN Airtime',
    phone: '08011111111',
    amountNgn: '100',
    amountUsdc: '0.071',
    fxRateNgnPerUsdc: '1408.45',
    payerWallet: '0x2222222222222222222222222222222222222222',
    quoteExpiresAt: currentTime + 5 * 60_000,
    ...overrides,
  }
}

const first = await store.createQuote(quoteInput({ idempotencyKey: 'bill:idempotency:0001' }))
assert.equal(first.created, true)
assert.equal(first.intent.state, 'quoted')
assert.match(first.intent.requestId, /^202607191300[a-zA-Z0-9]+$/)
assert.equal(first.intent.network, 'base')
assert.equal(first.intent.providerEnvironment, 'sandbox')

const replay = await store.createQuote(quoteInput({
  idempotencyKey: 'bill:idempotency:0001',
  amountUsdc: '0.072',
  fxRateNgnPerUsdc: '1390',
  quoteExpiresAt: currentTime + 10 * 60_000,
}))
assert.equal(replay.created, false)
assert.equal(replay.intent.id, first.intent.id)
assert.equal(replay.intent.amountUsdc, '0.071')

await assert.rejects(
  () => store.createQuote(quoteInput({ idempotencyKey: 'bill:idempotency:0001', phone: '08022222222' })),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_IDEMPOTENCY_CONFLICT',
)

await assert.rejects(
  () => store.getOwnedIntent('privy:other-owner', first.intent.id),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_FORBIDDEN',
)

const publicIntent = publicPocketBillsIntent(first.intent)
const serializedPublic = JSON.stringify(publicIntent)
assert.equal('ownerId' in publicIntent, false)
assert.equal('idempotencyKey' in publicIntent, false)
assert.equal('requestFingerprint' in publicIntent, false)
assert.doesNotMatch(serializedPublic, /privy:owner-1|bill:idempotency:0001/)

await store.markAwaitingPayment('privy:owner-1', first.intent.id)
const paymentHash = `0x${'a'.repeat(64)}`
const paid = await store.recordVerifiedPayment({ ownerId: 'privy:owner-1', intentId: first.intent.id, txHash: paymentHash })
assert.equal(paid.state, 'payment_confirmed')
assert.equal(paid.txHash, paymentHash)
const paidReplay = await store.recordVerifiedPayment({ ownerId: 'privy:owner-1', intentId: first.intent.id, txHash: paymentHash.toUpperCase().replace('0X', '0x') })
assert.equal(paidReplay.state, 'payment_confirmed')

const vendingClaim = await store.claimVending('privy:owner-1', first.intent.id)
assert.equal(vendingClaim.claimed, true)
const vendingReplay = await store.claimVending('privy:owner-1', first.intent.id)
assert.equal(vendingReplay.claimed, false)
const pending = await store.recordProviderResult('privy:owner-1', first.intent.id, {
  status: 'pending',
  providerCode: '099',
  providerStatus: 'pending',
  responseDescription: 'TRANSACTION IS PROCESSING',
  requestId: first.intent.requestId,
  transactionId: '',
  productName: 'MTN Airtime',
  recipient: '08011111111',
  amountNgn: 100,
  purchasedCode: '',
  retryable: true,
  requeryRequired: true,
})
assert.equal(pending.state, 'pending')

const delivered = await store.recordProviderResult('privy:owner-1', first.intent.id, {
  status: 'delivered',
  providerCode: '000',
  providerStatus: 'delivered',
  responseDescription: 'TRANSACTION SUCCESSFUL',
  requestId: first.intent.requestId,
  transactionId: 'vtpass-tx-1',
  productName: 'MTN Airtime',
  recipient: '08011111111',
  amountNgn: 100,
  purchasedCode: '',
  retryable: false,
  requeryRequired: false,
})
assert.equal(delivered.state, 'delivered')

const enrichedDelivered = await store.recordProviderResult('privy:owner-1', first.intent.id, {
  status: 'delivered', providerCode: '000', providerStatus: 'delivered', responseDescription: 'TRANSACTION SUCCESSFUL',
  requestId: first.intent.requestId, transactionId: 'vtpass-tx-1', productName: 'MTN Airtime', recipient: '08011111111', amountNgn: 100,
  purchasedCode: 'Token : 26362054405982757802', retryable: false, requeryRequired: false,
}, { requery: true })
assert.equal(enrichedDelivered.state, 'delivered')
assert.equal(enrichedDelivered.purchasedCode, 'Token : 26362054405982757802')
assert.equal(publicPocketBillsIntent(enrichedDelivered).purchasedCode, 'Token : 26362054405982757802')

storage.unsafeUpdate(data => {
  data.intents[first.intent.id].paymentAmountUsdc = ''
  return data
})
const backfilled = await store.backfillVerifiedPaymentAmount({
  ownerId: 'privy:owner-1',
  intentId: first.intent.id,
  txHash: paymentHash,
  paymentAmountUsdc: '0.072675',
})
assert.equal(backfilled.state, 'delivered')
assert.equal(backfilled.paymentAmountUsdc, '0.072675')
await assert.rejects(
  () => store.backfillVerifiedPaymentAmount({
    ownerId: 'privy:owner-1',
    intentId: first.intent.id,
    txHash: paymentHash,
    paymentAmountUsdc: '0.072674',
  }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_PAYMENT_AMOUNT_MISMATCH',
)

const noDowngrade = await store.recordProviderResult('privy:owner-1', first.intent.id, {
  status: 'pending', providerCode: '099', providerStatus: 'pending', responseDescription: 'PROCESSING',
  requestId: first.intent.requestId, transactionId: 'vtpass-tx-1', productName: '', recipient: '', amountNgn: 100,
  purchasedCode: '', retryable: true, requeryRequired: true,
})
assert.equal(noDowngrade.state, 'delivered')
assert.equal(noDowngrade.providerStatus, 'delivered')
assert.equal(noDowngrade.providerCode, '000')

await assert.rejects(
  () => store.recordProviderResult('privy:owner-1', first.intent.id, {
    status: 'pending', providerCode: '099', providerStatus: 'pending', responseDescription: 'PROCESSING',
    requestId: '202607191300different', transactionId: '', productName: '', recipient: '', amountNgn: 100,
    purchasedCode: '', retryable: true, requeryRequired: true,
  }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_PROVIDER_MISMATCH',
)
await assert.rejects(
  () => store.recordProviderResult('privy:owner-1', first.intent.id, {
    status: 'pending', providerCode: '099', providerStatus: 'pending', responseDescription: 'PROCESSING',
    requestId: first.intent.requestId, transactionId: '', productName: '', recipient: '08099999999', amountNgn: 100,
    purchasedCode: '', retryable: true, requeryRequired: true,
  }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_PROVIDER_MISMATCH',
)
await assert.rejects(
  () => store.recordProviderResult('privy:owner-1', first.intent.id, {
    status: 'pending', providerCode: '099', providerStatus: 'pending', responseDescription: 'PROCESSING',
    requestId: first.intent.requestId, transactionId: '', productName: '', recipient: '08011111111', amountNgn: 101,
    purchasedCode: '', retryable: true, requeryRequired: true,
  }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_PROVIDER_MISMATCH',
)

const reversed = await store.recordProviderResult('privy:owner-1', first.intent.id, {
  status: 'reversed', providerCode: '040', providerStatus: 'reversed', responseDescription: 'TRANSACTION REVERSAL TO WALLET',
  requestId: first.intent.requestId, transactionId: 'vtpass-tx-1', productName: '', recipient: '', amountNgn: 100,
  purchasedCode: '', retryable: false, requeryRequired: false,
})
assert.equal(reversed.state, 'provider_failed_unverified')
const verifiedReversal = await store.recordProviderResult('privy:owner-1', first.intent.id, {
  status: 'reversed', providerCode: '040', providerStatus: 'reversed', responseDescription: 'TRANSACTION REVERSAL TO WALLET',
  requestId: first.intent.requestId, transactionId: 'vtpass-tx-1', productName: '', recipient: '', amountNgn: 100,
  purchasedCode: '', retryable: false, requeryRequired: false,
}, { requery: true })
assert.equal(verifiedReversal.state, 'refund_eligible')

await assert.rejects(
  () => store.markRefundSubmitted({ ownerId: 'privy:owner-1', intentId: first.intent.id, refundTxHash: paymentHash }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_TX_HASH_REUSED',
)
const refundHash = `0x${'b'.repeat(64)}`
const refundClaims = await Promise.all([
  store.claimRefund({ intentId: first.intent.id, treasuryAddress: config.treasuryAddress }),
  store.claimRefund({ intentId: first.intent.id, treasuryAddress: config.treasuryAddress }),
])
assert.equal(refundClaims.filter(item => item.claimed).length, 1)
assert.match(refundClaims[0].intent.refundIdempotencyKey, /^[0-9a-f-]{36}$/i)
await assert.rejects(
  () => store.claimRefund({ intentId: first.intent.id, treasuryAddress: '0x3333333333333333333333333333333333333333' }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_REFUND_TREASURY_MISMATCH',
)
await store.recordCircleRefundSubmission({ intentId: first.intent.id, circleTransactionId: '99999999-9999-5999-8999-999999999999' })
await store.recordCircleRefundStatus({ intentId: first.intent.id, circleState: 'COMPLETE', refundTxHash: refundHash })
const refunded = await store.markRefunded('privy:owner-1', first.intent.id)
assert.equal(refunded.state, 'refunded')
assert.equal(refunded.refundCircleState, 'COMPLETE')

const second = await store.createQuote(quoteInput({
  ownerId: 'privy:owner-2',
  idempotencyKey: 'bill:idempotency:0002',
  phone: '08033333333',
}))
await assert.rejects(
  () => store.recordVerifiedPayment({ ownerId: 'privy:owner-2', intentId: second.intent.id, txHash: paymentHash }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_TX_HASH_REUSED',
)
await store.recordVerifiedPayment({ ownerId: 'privy:owner-2', intentId: second.intent.id, txHash: `0x${'d'.repeat(64)}` })
await store.claimVending('privy:owner-2', second.intent.id)
await assert.rejects(
  () => store.recordProviderResult('privy:owner-2', second.intent.id, {
    status: 'delivered', providerCode: '000', providerStatus: 'delivered', responseDescription: 'TRANSACTION SUCCESSFUL',
    requestId: second.intent.requestId, transactionId: 'vtpass-tx-1', productName: 'MTN Airtime', recipient: '08033333333', amountNgn: 100,
    purchasedCode: '', retryable: false, requeryRequired: false,
  }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_PROVIDER_TX_REUSED',
)

const expiring = await store.createQuote(quoteInput({ idempotencyKey: 'bill:idempotency:expired', phone: '08044444444' }))
currentTime = expiring.intent.quoteExpiresAt + 1
await assert.rejects(
  () => store.recordVerifiedPayment({ ownerId: 'privy:owner-1', intentId: expiring.intent.id, txHash: `0x${'c'.repeat(64)}` }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_QUOTE_EXPIRED',
)
const delayedReconciliation = await store.recordVerifiedPayment({
  ownerId: 'privy:owner-1',
  intentId: expiring.intent.id,
  txHash: `0x${'c'.repeat(64)}`,
  confirmedAt: expiring.intent.quoteExpiresAt - 1,
})
assert.equal(delayedReconciliation.state, 'payment_confirmed')

const gracePeriodIntent = await store.createQuote(quoteInput({ idempotencyKey: 'bill:idempotency:grace-period', phone: '08044444445' }))
currentTime = gracePeriodIntent.intent.quoteExpiresAt + 4 * 60_000
const gracePeriodPayment = await store.recordVerifiedPayment({
  ownerId: 'privy:owner-1',
  intentId: gracePeriodIntent.intent.id,
  txHash: `0x${'e'.repeat(64)}`,
  confirmedAt: gracePeriodIntent.intent.quoteExpiresAt + 4 * 60_000,
})
assert.equal(gracePeriodPayment.state, 'payment_confirmed')

const beyondGraceIntent = await store.createQuote(quoteInput({ idempotencyKey: 'bill:idempotency:beyond-grace', phone: '08044444446' }))
currentTime = beyondGraceIntent.intent.quoteExpiresAt + 5 * 60_000 + 1
await assert.rejects(
  () => store.recordVerifiedPayment({
    ownerId: 'privy:owner-1',
    intentId: beyondGraceIntent.intent.id,
    txHash: `0x${'f'.repeat(64)}`,
    confirmedAt: beyondGraceIntent.intent.quoteExpiresAt + 5 * 60_000 + 1,
  }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_QUOTE_EXPIRED',
)

currentTime = Date.parse('2026-07-20T08:00:00.000Z')
const failedIntent = await store.createQuote(quoteInput({ idempotencyKey: 'bill:idempotency:failed', phone: '08055555555' }))
const failedBeforePayment = await store.failBeforePayment('privy:owner-1', failedIntent.intent.id, 'Customer cancelled')
assert.equal(failedBeforePayment.state, 'failed')

currentTime = Date.parse('2026-07-20T23:59:30+01:00')
const midnightIntent = await store.createQuote(quoteInput({
  idempotencyKey: 'bill:idempotency:midnight',
  phone: '08055555556',
  quoteExpiresAt: currentTime + 5 * 60_000,
}))
const originalRequestId = midnightIntent.intent.requestId
currentTime = Date.parse('2026-07-21T00:00:10+01:00')
const midnightPrepared = await store.markAwaitingPayment('privy:owner-1', midnightIntent.intent.id)
assert.notEqual(midnightPrepared.requestId, originalRequestId)
assert.equal(midnightPrepared.requestId.slice(0, 8), '20260721')

const concurrencyConfig = readVtpassPhase0Config({
  ...env,
  POCKET_BILLS_MAX_NGN: '200',
  POCKET_BILLS_DAILY_LIMIT_NGN: '300',
  POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:concurrency-test',
})
let concurrencyUuid = 0
const concurrencyStore = createPocketBillsStore({
  config: concurrencyConfig,
  storage: memoryStorage(),
  now: () => currentTime,
  uuid: () => `10000000-0000-4000-8000-${String(++concurrencyUuid).padStart(12, '0')}`,
})
const concurrent = await Promise.allSettled([0, 1, 2, 3].map(index => concurrencyStore.createQuote({
  ...quoteInput(),
  ownerId: 'privy:concurrent-owner',
  idempotencyKey: `bill:parallel:${String(index).padStart(16, '0')}`,
  phone: `0801111111${index}`,
  quoteExpiresAt: currentTime + 5 * 60_000,
})))
assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 4)

const idempotencyStorage = memoryStorage()
let idempotencyUuid = 0
const idempotencyStore = createPocketBillsStore({
  config,
  storage: idempotencyStorage,
  now: () => currentTime,
  uuid: () => `20000000-0000-4000-8000-${String(++idempotencyUuid).padStart(12, '0')}`,
})
const duplicateInput = {
  ...quoteInput(),
  ownerId: 'privy:idempotency-owner',
  idempotencyKey: 'bill:parallel:idempotency',
  quoteExpiresAt: currentTime + 5 * 60_000,
}
const duplicateResults = await Promise.all([
  idempotencyStore.createQuote(duplicateInput),
  idempotencyStore.createQuote({ ...duplicateInput, amountUsdc: '0.072', fxRateNgnPerUsdc: '1390' }),
])
assert.equal(duplicateResults.filter(result => result.created).length, 1)
assert.equal(duplicateResults[0].intent.id, duplicateResults[1].intent.id)

await store.consumeMutationLimit({ ownerId: 'privy:rate-limit-owner', action: 'refund', windowMs: 60_000, max: 2 })
await store.consumeMutationLimit({ ownerId: 'privy:rate-limit-owner', action: 'refund', windowMs: 60_000, max: 2 })
await assert.rejects(
  () => store.consumeMutationLimit({ ownerId: 'privy:rate-limit-owner', action: 'refund', windowMs: 60_000, max: 2 }),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_RATE_LIMITED' && error.status === 429,
)

const unavailableStore = createPocketBillsStore({
  config,
  storage: {
    ready: () => false,
    read: async () => undefined,
    mutate: async () => { throw new Error('must not mutate') },
  },
})
await assert.rejects(
  () => unavailableStore.listOwnedIntents('privy:owner-1'),
  error => error instanceof PocketBillsStoreError && error.code === 'BILLS_STORAGE_NOT_CONFIGURED',
)

const listed = await store.listOwnedIntents('privy:owner-1')
assert.ok(listed.length >= 3)
assert.ok(listed.every(intent => intent.ownerId === 'privy:owner-1'))

console.log('Circle Pocket Bills durable store smoke tests passed.')

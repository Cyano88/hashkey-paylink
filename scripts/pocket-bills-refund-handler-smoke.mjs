import assert from 'node:assert/strict'
import { createPocketBillsRefundHandler, createPocketBillsUserRefundHandler } from '../api/pocket/bills-refunds.ts'
import { createPocketBillsStore } from '../api/pocket/bills-store.ts'
import { readCircleTreasuryConfig } from '../api/circle-developer-treasury.ts'
import { readVtpassPhase0Config, } from '../api/vtpass-config.ts'

const treasuryAddress = '0x1111111111111111111111111111111111111111'
const payerWallet = '0x2222222222222222222222222222222222222222'
const walletSetId = '11111111-1111-5111-8111-111111111111'
const walletId = '22222222-2222-5222-8222-222222222222'
const circleTransactionId = '33333333-3333-5333-8333-333333333333'
const refundTxHash = `0x${'b'.repeat(64)}`
const adminSecret = 'refund-handler-test-secret-value'
process.env.ADMIN_SECRET = adminSecret

const env = {
  VTPASS_ENVIRONMENT: 'sandbox',
  VTPASS_API_BASE: 'https://sandbox.vtpass.com',
  VTPASS_API_KEY: 'static-api-key',
  VTPASS_PUBLIC_KEY: 'PK_public',
  VTPASS_SECRET_KEY: 'SK_secret',
  POCKET_BILLS_ENABLED: 'true',
  VTPASS_SANDBOX_VENDING_ENABLED: 'true',
  VTPASS_LIVE_VENDING_ENABLED: 'false',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'true',
  POCKET_BILLS_TREASURY_ADDRESS: treasuryAddress,
  POCKET_BILLS_MIN_NGN: '100',
  POCKET_BILLS_MAX_NGN: '1000',
  POCKET_BILLS_DAILY_LIMIT_NGN: '10000',
  VTPASS_MINIMUM_WALLET_BALANCE_NGN: '5000',
  POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:refund-test',
  CIRCLE_BASE_URL: 'https://api.circle.com',
  CIRCLE_API_KEY: 'TEST_API_KEY',
  CIRCLE_ENTITY_SECRET: 'ab'.repeat(32),
  POCKET_BILLS_TREASURY_WALLET_SET_ID: walletSetId,
  POCKET_BILLS_TREASURY_WALLET_ID: walletId,
  POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY: '44444444-4444-4444-8444-444444444444',
  POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY: '55555555-5555-4555-8555-555555555555',
}

function memoryStorage() {
  let value
  let queue = Promise.resolve()
  return {
    ready: () => true,
    async read() { return value === undefined ? undefined : structuredClone(value) },
    async mutate(_key, fn) {
      let release
      const previous = queue
      queue = new Promise(resolve => { release = resolve })
      await previous
      try {
        value = structuredClone(await fn(value === undefined ? undefined : structuredClone(value)))
        return structuredClone(value)
      } finally { release() }
    },
  }
}

let counter = 0
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
const billsConfig = readVtpassPhase0Config(env)
const circleConfig = readCircleTreasuryConfig(env)
assert.equal(circleConfig.verificationReady, true)
const store = createPocketBillsStore({ config: billsConfig, storage: memoryStorage(), uuid, now: () => Date.parse('2026-07-20T02:00:00Z') })
const quote = await store.createQuote({
  ownerId: 'privy:refund-owner',
  idempotencyKey: 'bill:refund:handler:0001',
  serviceId: 'mtn',
  serviceName: 'MTN Airtime VTU',
  phone: '08011111111',
  amountNgn: '100',
  amountUsdc: '0.071',
  fxRateNgnPerUsdc: '1408.45',
  payerWallet,
  quoteExpiresAt: Date.parse('2026-07-20T02:05:00Z'),
})
await store.recordVerifiedPayment({
  ownerId: 'privy:refund-owner',
  intentId: quote.intent.id,
  txHash: `0x${'a'.repeat(64)}`,
  paymentAmountUsdc: '0.072',
})
await store.claimVending('privy:refund-owner', quote.intent.id)
const unverifiedFailure = await store.recordProviderResult('privy:refund-owner', quote.intent.id, {
  status: 'failed', providerCode: '099', providerStatus: 'failed', responseDescription: 'FAILED',
  requestId: quote.intent.requestId, transactionId: 'vtpass-refund-test', productName: 'MTN Airtime VTU',
  recipient: '08011111111', amountNgn: 100, purchasedCode: '', retryable: false, requeryRequired: false,
})
assert.equal(unverifiedFailure.state, 'provider_failed_unverified')
const eligibleRefund = await store.recordProviderResult('privy:refund-owner', quote.intent.id, {
  status: 'failed', providerCode: '099', providerStatus: 'failed', responseDescription: 'FAILED',
  requestId: quote.intent.requestId, transactionId: 'vtpass-refund-test', productName: 'MTN Airtime VTU',
  recipient: '08011111111', amountNgn: 100, purchasedCode: '', retryable: false, requeryRequired: false,
}, { requery: true })
assert.equal(eligibleRefund.state, 'refund_eligible')

const calls = { created: 0, verified: 0, providerRequeries: 0 }
let providerMode = 'failed'
const provider = {
  async requeryTransaction(requestId) {
    calls.providerRequeries += 1
    const intent = await store.getIntentById(requestId === quote.intent.requestId ? quote.intent.id : guardedQuote.intent.id)
    return {
      status: providerMode,
      providerCode: providerMode === 'delivered' ? '000' : '016',
      providerStatus: providerMode,
      responseDescription: providerMode.toUpperCase(),
      requestId: intent.requestId,
      transactionId: intent.providerTransactionId,
      productName: intent.serviceName,
      recipient: intent.phone,
      amountNgn: Number(intent.amountNgn),
      purchasedCode: '',
      retryable: false,
      requeryRequired: false,
    }
  },
}
let guardedQuote
const circle = {
  async verifyConfiguredWallet() { return { id: walletId, address: treasuryAddress } },
  async createUsdcTransfer(input) {
    calls.created += 1
    assert.equal(input.destinationAddress, payerWallet)
    assert.equal(input.amount, '0.072')
    return { id: circleTransactionId }
  },
  async getTransaction() {
    return {
      id: circleTransactionId, blockchain: 'BASE', state: 'CONFIRMED', transactionType: 'OUTBOUND',
      walletId, sourceAddress: treasuryAddress, destinationAddress: payerWallet, amounts: ['0.072'], tokenId: '',
      txHash: refundTxHash, refId: `pocket-bills-refund:${quote.intent.id}`, errorReason: '', errorDetails: '',
    }
  },
}

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    setHeader(name, value) { this.headers[name] = value },
  }
}

const handler = createPocketBillsRefundHandler({
  billsConfig,
  circleConfig,
  store,
  circle,
  provider,
  async verifyTransfer(input) {
    calls.verified += 1
    assert.equal(input.payer, treasuryAddress)
    assert.equal(input.recipient, payerWallet)
    return { ok: true, amountUnits: '72000', amount: '0.072' }
  },
})

const unauthorized = response()
await handler({ method: 'POST', headers: {}, body: { intentId: quote.intent.id } }, unauthorized)
assert.equal(unauthorized.statusCode, 401)

const success = response()
await handler({ method: 'POST', headers: { authorization: `Bearer ${adminSecret}` }, body: { intentId: quote.intent.id } }, success)
assert.equal(success.statusCode, 200)
assert.equal(success.body.state, 'refunded')
assert.equal(calls.created, 1)
assert.equal(calls.verified, 1)
assert.equal(calls.providerRequeries, 1)

const replay = response()
await handler({ method: 'POST', headers: { authorization: `Bearer ${adminSecret}` }, body: { intentId: quote.intent.id } }, replay)
assert.equal(replay.statusCode, 200)
assert.equal(calls.created, 1)
assert.equal(calls.providerRequeries, 1)

const userHandler = createPocketBillsUserRefundHandler({
  billsConfig,
  circleConfig,
  store,
  circle,
  provider,
  verifyTransfer: async () => { throw new Error('already refunded') },
  verifyUser: async () => ({ userId: 'privy:refund-owner' }),
})
const userReplay = response()
await userHandler({ method: 'POST', headers: {}, body: { intent_id: quote.intent.id } }, userReplay)
assert.equal(userReplay.statusCode, 200)
assert.equal(userReplay.body.data.intent.state, 'refunded')
assert.equal(calls.created, 1)

guardedQuote = await store.createQuote({
  ownerId: 'privy:refund-owner', idempotencyKey: 'bill:refund:handler:0002', serviceId: 'mtn', serviceName: 'MTN Airtime VTU',
  phone: '08022222222', amountNgn: '100', amountUsdc: '0.071', fxRateNgnPerUsdc: '1408.45', payerWallet,
  quoteExpiresAt: Date.parse('2026-07-20T02:05:00Z'),
})
await store.recordVerifiedPayment({ ownerId: 'privy:refund-owner', intentId: guardedQuote.intent.id, txHash: `0x${'c'.repeat(64)}`, paymentAmountUsdc: '0.072' })
await store.claimVending('privy:refund-owner', guardedQuote.intent.id)
const guardedFailure = {
  status: 'failed', providerCode: '016', providerStatus: 'failed', responseDescription: 'FAILED', requestId: guardedQuote.intent.requestId,
  transactionId: 'vtpass-refund-guard', productName: 'MTN Airtime VTU', recipient: '08022222222', amountNgn: 100,
  purchasedCode: '', retryable: false, requeryRequired: false,
}
await store.recordProviderResult('privy:refund-owner', guardedQuote.intent.id, guardedFailure)
await store.recordProviderResult('privy:refund-owner', guardedQuote.intent.id, guardedFailure, { requery: true })
providerMode = 'delivered'
const providerRecovered = response()
await userHandler({ method: 'POST', headers: {}, body: { intent_id: guardedQuote.intent.id } }, providerRecovered)
assert.equal(providerRecovered.statusCode, 409)
assert.equal(providerRecovered.body.error.code, 'BILLS_REFUND_PROVIDER_DELIVERED')
assert.equal((await store.getIntentById(guardedQuote.intent.id)).state, 'delivered')
assert.equal(calls.created, 1)
providerMode = 'failed'

const forbiddenHandler = createPocketBillsUserRefundHandler({
  billsConfig,
  circleConfig,
  store,
  circle,
  provider,
  verifyTransfer: async () => { throw new Error('not called') },
  verifyUser: async () => ({ userId: 'privy:other-owner' }),
})
const forbidden = response()
await forbiddenHandler({ method: 'POST', headers: {}, body: { intent_id: quote.intent.id } }, forbidden)
assert.equal(forbidden.statusCode, 403)
assert.equal(forbidden.body.error.code, 'BILLS_FORBIDDEN')

const unauthenticatedHandler = createPocketBillsUserRefundHandler({
  billsConfig,
  circleConfig,
  store,
  circle,
  provider,
  verifyTransfer: async () => { throw new Error('not called') },
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
})
const unauthenticated = response()
await unauthenticatedHandler({ method: 'POST', headers: {}, body: { intent_id: quote.intent.id } }, unauthenticated)
assert.equal(unauthenticated.statusCode, 401)
assert.equal(unauthenticated.body.error.code, 'AUTH_REQUIRED')

const disabled = response()
const disabledHandler = createPocketBillsRefundHandler({ ...{ billsConfig: { ...billsConfig, refundsReady: false }, circleConfig, store, circle, provider }, verifyTransfer: async () => { throw new Error('not called') } })
await disabledHandler({ method: 'POST', headers: { authorization: `Bearer ${adminSecret}` }, body: { intentId: quote.intent.id } }, disabled)
assert.equal(disabled.statusCode, 503)

console.log('Circle Pocket Bills refund handler smoke tests passed.')

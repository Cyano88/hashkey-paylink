import assert from 'node:assert/strict'
import { createVtpassBillsWebhookHandler } from '../api/pocket/bills-webhook.ts'
import { createPocketBillsStore } from '../api/pocket/bills-store.ts'
import { readVtpassPhase0Config } from '../api/vtpass-config.ts'

const env = {
  VTPASS_ENVIRONMENT: 'sandbox', VTPASS_API_BASE: 'https://sandbox.vtpass.com', VTPASS_API_KEY: 'static-api-key',
  VTPASS_PUBLIC_KEY: 'PK_public', VTPASS_SECRET_KEY: 'SK_secret', POCKET_BILLS_ENABLED: 'true',
  VTPASS_SANDBOX_VENDING_ENABLED: 'true', VTPASS_LIVE_VENDING_ENABLED: 'false', VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'true', POCKET_BILLS_TREASURY_ADDRESS: '0x1111111111111111111111111111111111111111',
  POCKET_BILLS_MIN_NGN: '100', POCKET_BILLS_MAX_NGN: '1000', POCKET_BILLS_DAILY_LIMIT_NGN: '10000',
  VTPASS_MINIMUM_WALLET_BALANCE_NGN: '5000', POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:webhook-test',
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

function response() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, body, method = 'POST') {
  const res = response()
  await handler({ method, body, headers: {} }, res)
  return res
}

let now = Date.parse('2026-07-20T12:00:00Z')
let counter = 0
const config = readVtpassPhase0Config(env)
const store = createPocketBillsStore({
  config,
  storage: memoryStorage(),
  now: () => now,
  uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
})

async function vendingIntent({ ownerId, idempotencyKey, phone, txDigit }) {
  const quote = await store.createQuote({
    ownerId, idempotencyKey, serviceId: 'mtn', serviceName: 'MTN Airtime VTU', phone,
    amountNgn: '100', amountUsdc: '0.072', fxRateNgnPerUsdc: '1400',
    payerWallet: '0x2222222222222222222222222222222222222222', quoteExpiresAt: now + 5 * 60_000,
  })
  await store.recordVerifiedPayment({ ownerId, intentId: quote.intent.id, txHash: `0x${txDigit.repeat(64)}`, paymentAmountUsdc: '0.072' })
  await store.claimVending(ownerId, quote.intent.id)
  return quote.intent
}

const intents = new Map()
const first = await vendingIntent({ ownerId: 'privy:webhook-owner', idempotencyKey: 'bill:webhook:test:0001', phone: '08011111111', txDigit: 'a' })
intents.set(first.requestId, first)

let providerMode = 'pending'
let providerCalls = 0
let delayProvider = false
const provider = {
  async requeryTransaction(requestId) {
    providerCalls += 1
    if (delayProvider) await new Promise(resolve => setTimeout(resolve, 20))
    const intent = intents.get(requestId)
    assert.ok(intent)
    const mismatch = providerMode === 'mismatch'
    const status = mismatch ? 'delivered' : providerMode
    return {
      status,
      providerCode: status === 'delivered' ? '000' : status === 'pending' ? '099' : '040',
      providerStatus: status,
      responseDescription: status.toUpperCase(),
      requestId,
      transactionId: status === 'pending' ? '' : `provider-${requestId}`,
      productName: intent.serviceName,
      recipient: mismatch ? '08099999999' : intent.phone,
      amountNgn: Number(intent.amountNgn),
      purchasedCode: '', retryable: status === 'pending', requeryRequired: status === 'pending',
    }
  },
}

const logs = []
const handler = createVtpassBillsWebhookHandler({ store, provider, enabled: true, log: (message, details) => logs.push({ message, details }) })

const wrongMethod = await request(handler, {}, 'GET')
assert.equal(wrongMethod.statusCode, 405)

const malformed = await request(handler, { type: 'transaction-update', data: { requestId: 'invalid' } })
assert.deepEqual(malformed.body, { response: 'success' })
assert.equal(providerCalls, 0)

const unknown = await request(handler, { type: 'transaction-update', data: { requestId: '202607201200unknown' } })
assert.deepEqual(unknown.body, { response: 'success' })
assert.equal(providerCalls, 0)

const forgedDelivered = await request(handler, {
  type: 'transaction-update',
  data: { requestId: first.requestId, content: { transactions: { status: 'delivered' } } },
})
assert.deepEqual(forgedDelivered.body, { response: 'success' })
assert.equal(providerCalls, 1)
assert.equal((await store.getIntentById(first.id)).state, 'pending')

await request(handler, { type: 'transaction-update', data: { request_id: first.requestId } })
assert.equal(providerCalls, 1, 'the durable cooldown must suppress an immediate replay')

now += 16_000
providerMode = 'delivered'
await request(handler, { type: 'transaction-update', data: { requestId: first.requestId, status: 'failed' } })
assert.equal(providerCalls, 2)
assert.equal((await store.getIntentById(first.id)).state, 'delivered', 'only the authenticated requery may set delivery')

now += 16_000
providerMode = 'reversed'
await request(handler, { type: 'transaction-update', data: { requestId: first.requestId } })
assert.equal((await store.getIntentById(first.id)).state, 'refund_eligible')

const concurrent = await vendingIntent({ ownerId: 'privy:webhook-owner-2', idempotencyKey: 'bill:webhook:test:0002', phone: '08022222222', txDigit: 'b' })
intents.set(concurrent.requestId, concurrent)
now += 16_000
providerMode = 'pending'
delayProvider = true
const callsBeforeConcurrency = providerCalls
await Promise.all([
  request(handler, { type: 'transaction-update', data: { requestId: concurrent.requestId } }),
  request(handler, { type: 'transaction-update', data: { requestId: concurrent.requestId } }),
])
delayProvider = false
assert.equal(providerCalls, callsBeforeConcurrency + 1, 'the durable lease must serialize concurrent callbacks')

const mismatch = await vendingIntent({ ownerId: 'privy:webhook-owner-3', idempotencyKey: 'bill:webhook:test:0003', phone: '08033333333', txDigit: 'c' })
intents.set(mismatch.requestId, mismatch)
now += 16_000
providerMode = 'mismatch'
await request(handler, { type: 'transaction-update', data: { requestId: mismatch.requestId } })
assert.equal((await store.getIntentById(mismatch.id)).state, 'needs_review')
assert.equal(logs.length, 1)

const disabledHandler = createVtpassBillsWebhookHandler({ store, provider, enabled: false })
await request(disabledHandler, { type: 'transaction-update', data: { requestId: mismatch.requestId } })
assert.equal(providerCalls, callsBeforeConcurrency + 2)

console.log('VTpass Bills webhook smoke tests passed: payloads are signals only, authenticated requery is authoritative, and replays are serialized.')

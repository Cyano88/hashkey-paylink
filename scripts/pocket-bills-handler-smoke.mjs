import assert from 'node:assert/strict'
import { createPocketBillsCatalogHandler, createPocketBillsQuoteHandler, createPocketBillsPayHandler } from '../api/pocket/bills.ts'
import { createPocketBillsStore } from '../api/pocket/bills-store.ts'
import { VtpassClientError } from '../api/vtpass-client.ts'
import { readVtpassPhase0Config } from '../api/vtpass-config.ts'

const env = {
  VTPASS_ENVIRONMENT: 'sandbox',
  VTPASS_API_BASE: 'https://sandbox.vtpass.com',
  VTPASS_API_KEY: 'static-api-key',
  VTPASS_PUBLIC_KEY: 'PK_public',
  VTPASS_SECRET_KEY: 'SK_secret',
  POCKET_BILLS_ENABLED: 'false',
  VTPASS_SANDBOX_VENDING_ENABLED: 'true',
  VTPASS_LIVE_VENDING_ENABLED: 'false',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'false',
  POCKET_BILLS_TREASURY_ADDRESS: '0x1111111111111111111111111111111111111111',
  POCKET_BILLS_MIN_NGN: '100',
  POCKET_BILLS_MAX_NGN: '1000',
  POCKET_BILLS_DAILY_LIMIT_NGN: '10000',
  VTPASS_MINIMUM_WALLET_BALANCE_NGN: '5000',
  POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:handler-test',
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

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, body, options = {}) {
  const response = responseRecorder()
  await handler({
    method: options.method ?? 'POST',
    body,
    headers: {
      authorization: 'Bearer pocket-test',
      'idempotency-key': options.idempotencyKey ?? 'bill:handler:read:0001',
      'x-test-owner': options.owner ?? 'did:privy:owner-1',
    },
    query: options.query ?? {},
  }, response)
  return response
}

let now = Date.parse('2026-07-19T12:00:00.000Z')
let uuidCounter = 0
let purchaseCalls = 0
let dataPurchaseCalls = 0
let verificationCalls = 0
let providerMode = 'delivered'
let requeryMode = 'delivered'
let providerBalance = 2_000_000
const config = readVtpassPhase0Config(env)
assert.equal(config.canSandboxVend, true)
const store = createPocketBillsStore({
  config,
  storage: memoryStorage(),
  now: () => now,
  uuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
})

function providerResult(input, status = 'delivered') {
  return {
    status,
    providerCode: status === 'delivered' ? '000' : status === 'pending' ? '099' : '016',
    providerStatus: status,
    responseDescription: status === 'delivered' ? 'TRANSACTION SUCCESSFUL' : status.toUpperCase(),
    requestId: input.requestId,
    transactionId: status === 'pending' ? '' : `provider-${input.requestId}`,
    productName: 'MTN Airtime',
    recipient: input.phone,
    amountNgn: Number(input.amountNgn),
    purchasedCode: '',
    retryable: status === 'pending',
    requeryRequired: status === 'pending',
  }
}

const provider = {
  async getWalletBalance() { return providerBalance },
  async listAirtimeServices() {
    return [{ serviceId: 'mtn', name: 'MTN Airtime', minimumAmount: 50, maximumAmount: 5000, convenienceFee: '0', productType: 'fix', imageUrl: '' }]
  },
  async listDataServices() {
    return [{ serviceId: 'mtn-data', name: 'MTN Data', minimumAmount: 1, maximumAmount: 1000000, convenienceFee: '0', productType: 'fix', imageUrl: '' }]
  },
  async listServiceVariations(serviceId) {
    assert.equal(serviceId, 'mtn-data')
    return [
      { variationCode: 'mtn-100mb-100', name: 'N100 100MB - 24 hrs', amount: 100, fixedPrice: true },
      { variationCode: 'mtn-2gb-1500', name: 'N1500 2GB - 30 days', amount: 1500, fixedPrice: true },
    ]
  },
  async purchaseAirtime(input) {
    purchaseCalls += 1
    if (providerMode === 'unknown') {
      throw new VtpassClientError({ code: 'VTPASS_OUTCOME_UNKNOWN', message: 'Provider response was not received.', status: 503, retryable: true, outcomeUnknown: true })
    }
    if (providerMode === 'denied') {
      throw new VtpassClientError({ code: 'VTPASS_ACCESS_DENIED', message: 'Provider denied the request.', status: 403 })
    }
    return providerResult(input, providerMode)
  },
  async purchaseData(input) {
    dataPurchaseCalls += 1
    assert.equal(input.serviceId, 'mtn-data')
    assert.equal(input.variationCode, 'mtn-100mb-100')
    return { ...providerResult(input, providerMode), productName: 'MTN Data' }
  },
  async requeryTransaction(requestId) {
    if (requeryMode === 'error') throw new VtpassClientError({ code: 'VTPASS_UNAVAILABLE', message: 'Provider status unavailable.', status: 503, retryable: true })
    const intent = (await store.listOwnedIntents('did:privy:owner-1', 100)).find(item => item.requestId === requestId)
    assert.ok(intent)
    return providerResult({ requestId, phone: intent.phone, amountNgn: intent.amountNgn }, requeryMode)
  },
}

let verifyMode = 'success'
const dependencies = {
  config,
  store,
  provider,
  verifyUser: async req => ({ userId: req.headers['x-test-owner'], email: 'owner@example.com', wallets: [] }),
  readPayerWallet: async ownerId => ownerId === 'did:privy:owner-1' ? '0x2222222222222222222222222222222222222222' : '',
  readFxQuote: async () => ({ rate: 1400, fetchedAt: now, expiresAt: now + 60_000, source: 'paycrest' }),
  verifyTransfer: async input => {
    verificationCalls += 1
    assert.equal(input.chain, 'base')
    assert.equal(input.recipient, config.treasuryAddress)
    assert.equal(input.payer, '0x2222222222222222222222222222222222222222')
    assert.equal(input.minAmount, '0.071429')
    if (verifyMode === 'pending') throw new Error('Transaction receipt was not found yet.')
    if (verifyMode === 'invalid') throw new Error('No matching USDC transfer to recipient for at least 0.071429 USDC.')
    return { ok: true, amountUnits: '71429', amount: '0.071429', confirmedAt: new Date(now + 10_000).toISOString() }
  },
  now: () => now,
  requestId: () => `http-request-${++uuidCounter}`,
}
const quoteHandler = createPocketBillsQuoteHandler(dependencies)
const payHandler = createPocketBillsPayHandler(dependencies)
const catalogHandler = createPocketBillsCatalogHandler(dependencies)

async function createQuote(idempotencyKey, phone = '08011111111') {
  return request(quoteHandler, {
    service_id: 'mtn', phone, amount_ngn: '100', payer_wallet: '0x2222222222222222222222222222222222222222',
  }, { idempotencyKey })
}

async function createDataQuote(idempotencyKey, variationCode = 'mtn-100mb-100') {
  return request(quoteHandler, {
    category: 'data', service_id: 'mtn-data', variation_code: variationCode, phone: '08011111111', amount_ngn: '1', payer_wallet: '0x2222222222222222222222222222222222222222',
  }, { idempotencyKey })
}

const dataServices = await request(catalogHandler, {}, { method: 'GET' })
assert.deepEqual(dataServices.body.data.services, [{ serviceId: 'mtn-data', name: 'MTN Data' }])
const dataPlans = await request(catalogHandler, {}, { method: 'GET', query: { service_id: 'mtn-data' } })
assert.deepEqual(dataPlans.body.data.variations, [{ variationCode: 'mtn-100mb-100', name: 'N100 100MB - 24 hrs', amountNgn: '100.00' }])

const badDataPlan = await createDataQuote('bill:handler:data:bad-plan', 'invented-plan')
assert.equal(badDataPlan.statusCode, 400)
assert.equal(badDataPlan.body.error.field, 'variationCode')

const dataQuote = await createDataQuote('bill:handler:data:quote:0001')
assert.equal(dataQuote.statusCode, 200)
assert.equal(dataQuote.body.data.intent.category, 'data')
assert.equal(dataQuote.body.data.intent.amountNgn, '100')
assert.equal(dataQuote.body.data.intent.variationCode, 'mtn-100mb-100')
await request(payHandler, { action: 'prepare', intent_id: dataQuote.body.data.intent.id })
const dataConfirmed = await request(payHandler, { action: 'confirm', intent_id: dataQuote.body.data.intent.id, tx_hash: `0x${'9'.repeat(64)}` })
assert.equal(dataConfirmed.body.data.intent.state, 'delivered')
assert.equal(dataPurchaseCalls, 1)

const quoted = await createQuote('bill:handler:quote:0001')
assert.equal(quoted.statusCode, 200)
assert.equal(quoted.body.data.intent.state, 'quoted')

const realSandboxPhone = await createQuote('bill:handler:quote:real-phone', '08106849696')
assert.equal(realSandboxPhone.statusCode, 400)
assert.equal(realSandboxPhone.body.error.message, 'VTpass sandbox Airtime uses the test number 08011111111. No real Airtime is delivered.')
assert.equal(quoted.body.data.intent.amountUsdc, '0.071429')
assert.equal(quoted.body.data.replayed, false)
assert.equal(quoted.headers['cache-control'], 'no-store')
assert.equal(JSON.stringify(quoted.body).includes('ownerId'), false)

const quoteReplay = await createQuote('bill:handler:quote:0001')
assert.equal(quoteReplay.body.data.replayed, true)
assert.equal(quoteReplay.body.data.intent.id, quoted.body.data.intent.id)

const prepared = await request(payHandler, { action: 'prepare', intent_id: quoted.body.data.intent.id })
assert.equal(prepared.body.data.intent.state, 'awaiting_payment')
const txHash = `0x${'a'.repeat(64)}`
const confirmed = await request(payHandler, { action: 'confirm', intent_id: quoted.body.data.intent.id, tx_hash: txHash })
assert.equal(confirmed.statusCode, 200)
assert.equal(confirmed.body.status, 'completed')
assert.equal(confirmed.body.data.intent.state, 'delivered')
assert.equal(purchaseCalls, 1)

const confirmedReplay = await request(payHandler, { action: 'confirm', intent_id: quoted.body.data.intent.id, tx_hash: txHash })
assert.equal(confirmedReplay.body.data.intent.state, 'delivered')
assert.equal(purchaseCalls, 1)
assert.equal(verificationCalls, 2)

// Two confirmations may verify independently, but only one may cross the
// atomic vending claim and call VTpass.
const concurrentQuote = await createQuote('bill:handler:quote:0002')
const concurrentId = concurrentQuote.body.data.intent.id
await request(payHandler, { action: 'prepare', intent_id: concurrentId })
const concurrentTx = `0x${'b'.repeat(64)}`
const beforeConcurrentCalls = purchaseCalls
const [concurrentA, concurrentB] = await Promise.all([
  request(payHandler, { action: 'confirm', intent_id: concurrentId, tx_hash: concurrentTx }),
  request(payHandler, { action: 'confirm', intent_id: concurrentId, tx_hash: concurrentTx }),
])
assert.equal(purchaseCalls, beforeConcurrentCalls + 1)
assert.ok(['vending', 'delivered'].includes(concurrentA.body.data.intent.state))
assert.ok(['vending', 'delivered'].includes(concurrentB.body.data.intent.state))

// An ambiguous provider submission must remain pending and become delivered
// only after a provider requery returns a final result.
providerMode = 'unknown'
const pendingQuote = await createQuote('bill:handler:quote:0003')
const pendingId = pendingQuote.body.data.intent.id
await request(payHandler, { action: 'prepare', intent_id: pendingId })
const pendingConfirm = await request(payHandler, { action: 'confirm', intent_id: pendingId, tx_hash: `0x${'c'.repeat(64)}` })
assert.equal(pendingConfirm.body.data.intent.state, 'pending')
providerMode = 'delivered'
requeryMode = 'delivered'
const reconciled = await request(payHandler, { action: 'status', intent_id: pendingId, refresh: true })
assert.equal(reconciled.body.data.refreshed, true)
assert.equal(reconciled.body.data.intent.state, 'delivered')

// A final provider failure after a verified payment must route to refund review.
providerMode = 'denied'
const failedQuote = await createQuote('bill:handler:quote:0004')
const failedId = failedQuote.body.data.intent.id
await request(payHandler, { action: 'prepare', intent_id: failedId })
const failed = await request(payHandler, { action: 'confirm', intent_id: failedId, tx_hash: `0x${'d'.repeat(64)}` })
assert.equal(failed.body.data.intent.state, 'provider_failed_unverified')
requeryMode = 'failed'
const failedVerified = await request(payHandler, { action: 'status', intent_id: failedId, refresh: true })
assert.equal(failedVerified.statusCode, 200)
assert.equal(failedVerified.body.data.intent.state, 'refund_eligible')
requeryMode = 'delivered'
providerMode = 'delivered'

// Chain uncertainty is retryable and never invokes the provider.
verifyMode = 'pending'
const unverifiedQuote = await createQuote('bill:handler:quote:0005')
const unverifiedId = unverifiedQuote.body.data.intent.id
await request(payHandler, { action: 'prepare', intent_id: unverifiedId })
const callsBeforeUnverified = purchaseCalls
const unverified = await request(payHandler, { action: 'confirm', intent_id: unverifiedId, tx_hash: `0x${'e'.repeat(64)}` })
assert.equal(unverified.statusCode, 409)
assert.equal(unverified.body.error.code, 'CONFIRMATION_REQUIRED')
assert.equal(unverified.body.error.retryable, true)
assert.equal(purchaseCalls, callsBeforeUnverified)
assert.equal((await store.getOwnedIntent('did:privy:owner-1', unverifiedId)).txHash, '')
verifyMode = 'success'

const forbidden = await request(payHandler, { action: 'status', intent_id: quoted.body.data.intent.id }, { owner: 'did:privy:other-owner' })
assert.equal(forbidden.statusCode, 403)
assert.equal(forbidden.body.error.code, 'FORBIDDEN')

providerBalance = 5000
const reserveBlocked = await createQuote('bill:handler:quote:0006')
assert.equal(reserveBlocked.statusCode, 503)
assert.equal(reserveBlocked.body.error.code, 'PROVIDER_UNAVAILABLE')
providerBalance = 2_000_000

const list = await request(payHandler, { action: 'list', limit: 100 })
assert.equal(list.statusCode, 200)
assert.ok(list.body.data.intents.length >= 5)
assert.ok(list.body.data.intents.every(intent => !('ownerId' in intent)))

console.log('Pocket Bills handler smoke test passed: auth, quotes, reserve, exact payment verification, atomic vending, idempotency, reconciliation, and refund routing are deterministic.')

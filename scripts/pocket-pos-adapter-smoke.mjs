import assert from 'node:assert/strict'
import { createPocketPosHandler } from '../api/pocket/pos.ts'
import { createPocketPos, parsePocketPosCreate } from '../src/pocket/api/pocketPosClient.ts'
import { isPocketMutationResult, isPocketPosCreateData } from '../src/pocket/lib/pocketSchemas.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, method, body = undefined, headers = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers }, res)
  return res
}

const merchant = {
  merchant_id: 'pos_test_merchant',
  display_name: 'Ada Shop',
  country: 'NG',
  payout_preference: 'KEEP_CRYPTO',
  settlement_enabled: true,
  kyc_status: 'UNVERIFIED',
  circle_smart_wallet_address: '0x1111111111111111111111111111111111111111',
  supported_networks: ['base'],
  bank_configured: false,
  fx_rate_ngn_per_usdc: '1600.00',
  fx_source: 'test',
}
const posRequest = {
  payout_preference: 'KEEP_CRYPTO',
  owner_email: 'ada@example.com',
  owner_first_name: 'Ada',
  owner_last_name: 'Lovelace',
  display_name: 'Ada Shop',
  supported_networks: ['base'],
  circle_smart_wallet_address: merchant.circle_smart_wallet_address,
  solana_wallet_address: '',
}
const idempotencyKey = 'pocket:pos-create:test-request-0001'
const calls = []
const handler = createPocketPosHandler({
  createMerchant: async (req, body) => {
    calls.push({ req, body })
    return { ok: true, merchant, replayed: calls.length > 1 }
  },
  requestId: () => 'pos-request-test',
})

const wrongMethod = await request(handler, 'GET')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(isPocketMutationResult(wrongMethod.body), true)

const missingKey = await request(handler, 'POST', posRequest)
assert.equal(missingKey.statusCode, 400)
assert.equal(missingKey.body.error.field, 'idempotencyKey')

const invalidBody = await request(handler, 'POST', { ...posRequest, supported_networks: ['ethereum'] }, { 'idempotency-key': idempotencyKey })
assert.equal(invalidBody.statusCode, 400)
assert.equal(invalidBody.body.error.field, 'pos')

const created = await request(handler, 'POST', posRequest, {
  authorization: 'Bearer privy-secret',
  'idempotency-key': idempotencyKey,
})
assert.equal(created.statusCode, 200)
assert.equal(isPocketMutationResult(created.body), true)
assert.equal(isPocketPosCreateData(created.body.data), true)
assert.deepEqual(created.body.data, { merchant, replayed: false })
assert.deepEqual(calls[0].body, posRequest)
assert.equal(calls[0].req.headers.authorization, 'Bearer privy-secret')
const serialized = JSON.stringify(created.body)
assert.equal(serialized.includes('privy-secret'), false)
assert.equal(serialized.includes('ada@example.com'), false)

const replay = await request(handler, 'POST', posRequest, { 'idempotency-key': idempotencyKey })
assert.equal(replay.body.data.replayed, true)

const unauthorizedHandler = createPocketPosHandler({
  createMerchant: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
})
const unauthorized = await request(unauthorizedHandler, 'POST', posRequest, { 'idempotency-key': idempotencyKey })
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const unavailableHandler = createPocketPosHandler({
  createMerchant: async () => { throw Object.assign(new Error('Paycrest unavailable.'), { status: 503 }) },
})
const unavailable = await request(unavailableHandler, 'POST', posRequest, { 'idempotency-key': idempotencyKey })
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

assert.deepEqual(parsePocketPosCreate(created.body), { merchant, replayed: false })

const fetchCalls = []
const clientResult = await createPocketPos({
  accessToken: 'client-privy-token',
  request: posRequest,
  idempotencyKey,
  fetcher: async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, json: async () => created.body }
  },
})
assert.deepEqual(clientResult, { merchant, replayed: false })
assert.equal(fetchCalls[0].url, '/api/pocket/pos')
assert.equal(fetchCalls[0].init.method, 'POST')
assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer client-privy-token')
assert.equal(fetchCalls[0].init.headers['idempotency-key'], idempotencyKey)
assert.deepEqual(JSON.parse(fetchCalls[0].init.body), posRequest)

console.log('Circle Pocket POS adapter smoke tests passed.')

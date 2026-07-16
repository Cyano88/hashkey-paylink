import assert from 'node:assert/strict'
import { createPocketBankSendHandler } from '../api/pocket/bank-send.ts'
import {
  createPocketBankSend,
  parsePocketBankSendCreate,
} from '../src/pocket/api/pocketBankSendClient.ts'
import {
  isPocketBankSendCreateData,
  isPocketMutationResult,
} from '../src/pocket/lib/pocketSchemas.ts'

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

const destinationAddress = '0x1111111111111111111111111111111111111111'
const link = {
  payment_url: 'https://pay.example/pay?src=bank-send&bankSend=send_test',
  dashboard_url: 'https://pay.example/dashboard?src=ngpos',
  link_id: 'send_test_link',
  amount_ngn: '1600.00',
  flexible_amount: false,
  destination_network: 'base',
  destination_address: destinationAddress,
}
const bankSendRequest = {
  owner_email: 'ada@example.com',
  owner_first_name: 'Ada',
  owner_last_name: 'Lovelace',
  display_name: 'Bank to USDC',
  amount: '1600',
  flexible_amount: false,
  network: 'base',
  destination_address: destinationAddress,
  client_origin: 'https://pay.example',
}
const idempotencyKey = 'pocket:bank-send:test-request-0001'
const calls = []
const handler = createPocketBankSendHandler({
  createBankSend: async (req, body) => {
    calls.push({ req, body })
    return { ok: true, link, replayed: calls.length > 1 }
  },
  requestId: () => 'bank-send-request-test',
})

const wrongMethod = await request(handler, 'GET')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(isPocketMutationResult(wrongMethod.body), true)

const missingKey = await request(handler, 'POST', bankSendRequest)
assert.equal(missingKey.statusCode, 400)
assert.equal(missingKey.body.error.field, 'idempotencyKey')

const invalidAddress = await request(handler, 'POST', { ...bankSendRequest, destination_address: '0xinvalid' }, {
  'idempotency-key': idempotencyKey,
})
assert.equal(invalidAddress.statusCode, 400)
assert.equal(invalidAddress.body.error.field, 'bankSend')

const created = await request(handler, 'POST', bankSendRequest, {
  authorization: 'Bearer privy-secret',
  'idempotency-key': idempotencyKey,
})
assert.equal(created.statusCode, 200)
assert.equal(isPocketMutationResult(created.body), true)
assert.equal(isPocketBankSendCreateData(created.body.data), true)
assert.deepEqual(created.body.data, { link, replayed: false })
assert.deepEqual(calls[0].body, bankSendRequest)
assert.equal(calls[0].req.headers.authorization, 'Bearer privy-secret')
const serialized = JSON.stringify(created.body)
assert.equal(serialized.includes('privy-secret'), false)
assert.equal(serialized.includes('ada@example.com'), false)

const replay = await request(handler, 'POST', bankSendRequest, { 'idempotency-key': idempotencyKey })
assert.equal(replay.body.data.replayed, true)

const unauthorizedHandler = createPocketBankSendHandler({
  createBankSend: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
})
const unauthorized = await request(unauthorizedHandler, 'POST', bankSendRequest, { 'idempotency-key': idempotencyKey })
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const unavailableHandler = createPocketBankSendHandler({
  createBankSend: async () => { throw Object.assign(new Error('Paycrest unavailable.'), { status: 503 }) },
})
const unavailable = await request(unavailableHandler, 'POST', bankSendRequest, { 'idempotency-key': idempotencyKey })
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

assert.deepEqual(parsePocketBankSendCreate(created.body), { link, replayed: false })

const fetchCalls = []
const clientResult = await createPocketBankSend({
  accessToken: 'client-privy-token',
  request: bankSendRequest,
  idempotencyKey,
  fetcher: async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, json: async () => created.body }
  },
})
assert.deepEqual(clientResult, { link, replayed: false })
assert.equal(fetchCalls[0].url, '/api/pocket/bank-send')
assert.equal(fetchCalls[0].init.method, 'POST')
assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer client-privy-token')
assert.equal(fetchCalls[0].init.headers['idempotency-key'], idempotencyKey)
assert.deepEqual(JSON.parse(fetchCalls[0].init.body), bankSendRequest)

console.log('Circle Pocket bank-send adapter smoke tests passed.')

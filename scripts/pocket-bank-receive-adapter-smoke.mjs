import assert from 'node:assert/strict'
import { createPocketBankReceiveHandler } from '../api/pocket/bank-receive.ts'
import {
  createPocketBankReceive,
  parsePocketBankReceiveCreate,
} from '../src/pocket/api/pocketBankReceiveClient.ts'
import {
  isPocketBankReceiveCreateData,
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

const link = {
  payment_url: 'https://pay.example/pay?n=base&id=bank_test',
  dashboard_url: 'https://pay.example/dashboard?id=bank_test',
  merchant_id: 'bank_test_merchant',
  intent_id: 'intent_test_merchant',
  amount_ngn: '1600.00',
  estimated_amount_usdc: '1',
  fx_rate_ngn_per_usdc: '1600.00',
  fx_source: 'paycrest',
  bank_name: 'Test Bank',
  bank_last4: '6789',
  bank_account_name: 'ADA LOVELACE',
}
const bankReceiveRequest = {
  owner_email: 'ada@example.com',
  owner_first_name: 'Ada',
  owner_last_name: 'Lovelace',
  display_name: 'Invoice 1',
  amount: '1600',
  flexible_amount: false,
  bank_name: 'Test Bank',
  bank_code: '001',
  account_number: '0123456789',
  account_name: 'ADA LOVELACE',
  client_origin: 'https://pay.example',
}
const idempotencyKey = 'pocket:bank-receive:test-request-0001'
const calls = []
const handler = createPocketBankReceiveHandler({
  createBankReceive: async (req, body) => {
    calls.push({ req, body })
    return { ok: true, link, replayed: calls.length > 1 }
  },
  requestId: () => 'bank-receive-request-test',
})

const wrongMethod = await request(handler, 'GET')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(isPocketMutationResult(wrongMethod.body), true)

const missingKey = await request(handler, 'POST', bankReceiveRequest)
assert.equal(missingKey.statusCode, 400)
assert.equal(missingKey.body.error.field, 'idempotencyKey')

const invalidBody = await request(handler, 'POST', { ...bankReceiveRequest, amount: '', flexible_amount: false }, { 'idempotency-key': idempotencyKey })
assert.equal(invalidBody.statusCode, 400)
assert.equal(invalidBody.body.error.field, 'bankReceive')

const created = await request(handler, 'POST', bankReceiveRequest, {
  authorization: 'Bearer privy-secret',
  'idempotency-key': idempotencyKey,
})
assert.equal(created.statusCode, 200)
assert.equal(isPocketMutationResult(created.body), true)
assert.equal(isPocketBankReceiveCreateData(created.body.data), true)
assert.deepEqual(created.body.data, { link, replayed: false })
assert.deepEqual(calls[0].body, bankReceiveRequest)
assert.equal(calls[0].req.headers.authorization, 'Bearer privy-secret')
const serialized = JSON.stringify(created.body)
assert.equal(serialized.includes('privy-secret'), false)
assert.equal(serialized.includes('ada@example.com'), false)
assert.equal(serialized.includes('0123456789'), false)

const replay = await request(handler, 'POST', bankReceiveRequest, { 'idempotency-key': idempotencyKey })
assert.equal(replay.body.data.replayed, true)

const unauthorizedHandler = createPocketBankReceiveHandler({
  createBankReceive: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
})
const unauthorized = await request(unauthorizedHandler, 'POST', bankReceiveRequest, { 'idempotency-key': idempotencyKey })
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const missingSavedBankHandler = createPocketBankReceiveHandler({
  createBankReceive: async () => { throw Object.assign(new Error('No verified bank account is saved yet.'), { status: 404 }) },
})
const missingSavedBank = await request(missingSavedBankHandler, 'POST', bankReceiveRequest, { 'idempotency-key': idempotencyKey })
assert.equal(missingSavedBank.statusCode, 404)
assert.equal(missingSavedBank.body.error.code, 'RESOURCE_NOT_FOUND')

const unavailableHandler = createPocketBankReceiveHandler({
  createBankReceive: async () => { throw Object.assign(new Error('Paycrest unavailable.'), { status: 503 }) },
})
const unavailable = await request(unavailableHandler, 'POST', bankReceiveRequest, { 'idempotency-key': idempotencyKey })
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

assert.deepEqual(parsePocketBankReceiveCreate(created.body), { link, replayed: false })

const fetchCalls = []
const clientResult = await createPocketBankReceive({
  accessToken: 'client-privy-token',
  request: bankReceiveRequest,
  idempotencyKey,
  fetcher: async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, json: async () => created.body }
  },
})
assert.deepEqual(clientResult, { link, replayed: false })
assert.equal(fetchCalls[0].url, '/api/pocket/bank-receive')
assert.equal(fetchCalls[0].init.method, 'POST')
assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer client-privy-token')
assert.equal(fetchCalls[0].init.headers['idempotency-key'], idempotencyKey)
assert.deepEqual(JSON.parse(fetchCalls[0].init.body), bankReceiveRequest)

console.log('Circle Pocket bank-receive adapter smoke tests passed.')

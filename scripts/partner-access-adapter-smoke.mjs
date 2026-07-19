import assert from 'node:assert/strict'
import { createPartnerAccessHandler } from '../api/partner-access.ts'

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

async function request(handler, method, body = undefined) {
  const response = responseRecorder()
  await handler({ method, body }, response)
  return response
}

let stored
const handler = createPartnerAccessHandler({
  hasStore: () => true,
  mutate: async (_key, update) => {
    stored = update(stored)
    return stored
  },
  createId: () => 'partner_testrequest',
  now: () => new Date('2026-07-19T12:00:00.000Z'),
})

const valid = {
  name: 'Ada Lovelace',
  email: 'ADA@EXAMPLE.COM',
  company: 'Analytical API',
  website: 'https://example.com',
  product: 'api-services',
  useCase: 'Sell individual financial data requests through a hosted USDC checkout.',
}

assert.equal((await request(handler, 'GET')).statusCode, 405)
assert.equal((await request(handler, 'POST', { ...valid, email: 'wrong' })).statusCode, 400)
assert.equal((await request(handler, 'POST', { ...valid, website: 'javascript:alert(1)' })).statusCode, 400)
assert.equal((await request(handler, 'POST', { ...valid, product: 'arbitrary' })).statusCode, 400)

const created = await request(handler, 'POST', valid)
assert.equal(created.statusCode, 201)
assert.equal(created.headers['cache-control'], 'no-store')
assert.deepEqual(created.body, { ok: true, requestId: 'partner_testrequest' })
assert.equal(stored.requests.length, 1)
assert.equal(stored.requests[0].email, 'ada@example.com')
assert.equal(stored.requests[0].status, 'requested')

const unavailable = await request(createPartnerAccessHandler({
  hasStore: () => false,
  mutate: async () => { throw new Error('must not write') },
  createId: () => 'unused',
  now: () => new Date(),
}), 'POST', valid)
assert.equal(unavailable.statusCode, 503)
assert.match(unavailable.body.error, /support@hashpaylink\.com/)

const storageFailure = await request(createPartnerAccessHandler({
  hasStore: () => true,
  mutate: async () => { throw new Error('database offline') },
  createId: () => 'unused',
  now: () => new Date(),
}), 'POST', valid)
assert.equal(storageFailure.statusCode, 503)
assert.match(storageFailure.body.error, /temporarily unavailable/)

console.log('Partner access adapter smoke tests passed.')

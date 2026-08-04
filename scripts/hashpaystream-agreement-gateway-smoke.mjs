import assert from 'node:assert/strict'
import { createHashPayStreamAgreementGateway } from '../modules/streampay/api/agreement-gateway.ts'

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

async function call(handler, userId, method = 'GET', input = {}) {
  const response = responseRecorder()
  await handler({
    method,
    query: input.query ?? {},
    body: input.body,
    headers: {
      authorization: `Bearer ${userId}`,
      ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
    },
  }, response)
  return response
}

const env = {
  HASHPAYSTREAM_ARC_API_KEY: `hpl_test_${'a'.repeat(32)}`,
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 'standalone-ownership-secret-32-characters',
  HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY: 'test:hashpaystream:owners',
  HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://app.hashpaylink.com',
}
const agreementId = 'agr_standalonegateway1234'
const agreement = {
  id: agreementId,
  title: 'Private user agreement',
  status: 'awaiting_start',
  releaseRequest: null,
  receipt: null,
}
const eventStore = {
  schema: 1,
  events: {
    evt_standalonegateway1234: {
      id: 'evt_standalonegateway1234',
      event: 'agreement.activated',
      agreementId,
      createdAt: '2026-08-03T12:01:00.000Z',
      receivedAt: '2026-08-03T12:01:01.000Z',
      data: { observedBlockNumber: '55000001' },
    },
  },
}
let store
const upstreamCalls = []
const dependencies = {
  hasStore: () => true,
  read: async () => store,
  readEvents: async () => eventStore,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  identity: async req => String(req.headers.authorization).replace(/^Bearer\s+/i, ''),
  upstream: async input => {
    upstreamCalls.push(input)
    if (input.method === 'POST' && !input.body?.action) {
      return {
        status: 201,
        body: {
          ok: true,
          agreement,
          payerReviewPath: `/agreements/${agreementId}#access=agrp_private_capability`,
        },
      }
    }
    if (input.method === 'POST' && input.body?.action === 'request_release') {
      return {
        status: 201,
        body: {
          ok: true,
          replayed: false,
          releaseRequest: {
            id: `opa_${'b'.repeat(24)}`,
            step: 0,
            status: 'awaiting_review',
            evidenceReference: input.body.evidenceReference,
          },
        },
      }
    }
    if (input.path.includes('?ids=')) return { status: 200, body: { ok: true, agreements: [agreement] } }
    return { status: 200, body: { ok: true, agreement } }
  },
  env: () => env,
  now: () => new Date('2026-08-03T12:00:00.000Z'),
}
const handler = createHashPayStreamAgreementGateway(dependencies)

const missingKey = await call(handler, 'user-a', 'POST', { body: { title: 'Missing key' } })
assert.equal(missingKey.statusCode, 400)

const created = await call(handler, 'user-a', 'POST', {
  idempotencyKey: 'agreement:user-a:0001',
  body: {
    template: 'fixed_unlock',
    title: 'Private user agreement',
    description: 'A protected private delivery.',
    amount: '0.1',
    recipient: '0x1111111111111111111111111111111111111111',
    externalId: 'browser-must-not-control-this',
    resourceId: 'browser-must-not-control-this',
  },
})
assert.equal(created.statusCode, 201)
assert.equal(created.body.agreement.id, agreementId)
assert.match(created.body.payerReviewPath, /#access=agrp_/)
assert.match(upstreamCalls[0].body.externalId, /^hps-[a-f0-9]{24}$/)
assert.match(upstreamCalls[0].body.resourceId, /^agreement:[a-f0-9]{24}$/)
assert.notEqual(upstreamCalls[0].body.externalId, 'browser-must-not-control-this')

const replayed = await call(handler, 'user-a', 'POST', {
  idempotencyKey: 'agreement:user-a:0001',
  body: { title: 'A changed browser body must not create another agreement.' },
})
assert.equal(replayed.statusCode, 200)
assert.equal(replayed.body.replayed, true)
assert.equal(upstreamCalls.filter(item => item.method === 'POST' && !item.body?.action).length, 1)

const ownerList = await call(handler, 'user-a')
assert.equal(ownerList.statusCode, 200)
assert.deepEqual(ownerList.body.agreements.map(item => item.id), [agreementId])
assert.deepEqual(ownerList.body.agreements[0].timeline, [{
  id: 'evt_standalonegateway1234',
  event: 'agreement.activated',
  createdAt: '2026-08-03T12:01:00.000Z',
  receivedAt: '2026-08-03T12:01:01.000Z',
  observedBlockNumber: '55000001',
}])
assert.deepEqual(ownerList.body.agreements[0].deliveryTimeline, [])
assert.match(upstreamCalls.at(-1).path, /\?ids=/)

const foreignList = await call(handler, 'user-b')
assert.equal(foreignList.statusCode, 200)
assert.deepEqual(foreignList.body.agreements, [])

const callsBeforeForeignAction = upstreamCalls.length
const foreignAction = await call(handler, 'user-b', 'POST', {
  body: {
    action: 'request_release',
    agreementId,
    deliveryNote: 'Attempt to touch another user agreement.',
    evidenceReference: 'https://delivery.example/foreign',
  },
})
assert.equal(foreignAction.statusCode, 404)
assert.equal(upstreamCalls.length, callsBeforeForeignAction)

const ownerAction = await call(handler, 'user-a', 'POST', {
  body: {
    action: 'request_release',
    agreementId,
    deliveryNote: 'Completed the protected private delivery.',
    evidenceReference: 'https://delivery.example/user-a',
  },
})
assert.equal(ownerAction.statusCode, 201)
assert.equal(ownerAction.body.releaseRequest.status, 'awaiting_review')
assert.equal(upstreamCalls.at(-1).body.agreementId, agreementId)

const invalidMethod = await call(handler, 'user-a', 'DELETE')
assert.equal(invalidMethod.statusCode, 405)
assert.equal(invalidMethod.headers.allow, 'GET, POST')

console.log('HashPayStream standalone agreement gateway smoke checks passed.')

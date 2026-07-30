import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildDeveloperWebhookRequest } from '../api/developer-projects.ts'
import { createHashPayStreamArcWebhookHandler } from '../api/hashpaystream-arc-webhook.ts'

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

const projectId = 'dev_hashpaystream1234'
const secret = `whsec_${'a'.repeat(32)}`
const now = new Date('2026-07-30T06:00:00.000Z')
/** @type {any} */
let store
const dependencies = {
  hasStore: () => true,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  env: () => ({
    HASHPAYSTREAM_ARC_PROJECT_ID: projectId,
    HASHPAYSTREAM_ARC_WEBHOOK_SECRET: secret,
    HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY: 'hashpaylink:test:hashpaystream-webhooks',
  }),
  now: () => now,
}
const handler = createHashPayStreamArcWebhookHandler(dependencies)

function requestFor(input = {}) {
  const eventId = input.eventId ?? 'evt_hashpaystream12345678'
  const event = input.event ?? 'agreement.activated'
  const data = {
    partnerId: input.projectId ?? projectId,
    agreementId: 'agr_hashpaystream12345678',
    network: input.network ?? 'arc',
    chainId: input.chainId ?? 5_042_002,
    status: 'active',
  }
  const signed = buildDeveloperWebhookRequest(secret, event, data, {
    eventId,
    createdAt: now.toISOString(),
    attemptedAt: input.attemptedAt ?? now.toISOString(),
  })
  return {
    method: 'POST',
    body: Buffer.from(input.rawBody ?? signed.payload),
    headers: {
      'x-hashpaylink-event': input.headerEventId ?? eventId,
      'x-hashpaylink-signature': input.signature ?? `t=${signed.timestamp},v1=${signed.signature}`,
    },
  }
}

async function call(request) {
  const response = responseRecorder()
  await handler(/** @type {any} */ (request), /** @type {any} */ (response))
  return response
}

const accepted = await call(requestFor())
assert.equal(accepted.statusCode, 200)
assert.equal(accepted.body.ok, true)
assert.equal(accepted.body.replayed, false)
assert.equal(store.events.evt_hashpaystream12345678.projectId, projectId)
assert.equal(store.events.evt_hashpaystream12345678.duplicateCount, 0)
assert.equal('signature' in store.events.evt_hashpaystream12345678, false)

const replay = await call(requestFor())
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.replayed, true)
assert.equal(store.events.evt_hashpaystream12345678.duplicateCount, 1)

const invalidSignature = await call(requestFor({ signature: `t=1785391200,v1=${'0'.repeat(64)}` }))
assert.equal(invalidSignature.statusCode, 401)
assert.equal(invalidSignature.body.error.code, 'INVALID_SIGNATURE')

const stale = await call(requestFor({ attemptedAt: '2026-07-30T05:50:00.000Z' }))
assert.equal(stale.statusCode, 401)
assert.equal(stale.body.error.code, 'STALE_SIGNATURE')

const wrongHeader = await call(requestFor({ headerEventId: 'evt_anotheridentifier1234' }))
assert.equal(wrongHeader.statusCode, 400)
assert.equal(wrongHeader.body.error.code, 'INVALID_PAYLOAD')

const unsupported = await call(requestFor({ eventId: 'evt_unsupported12345678', event: 'payment.confirmed' }))
assert.equal(unsupported.statusCode, 400)
assert.equal(unsupported.body.error.code, 'UNSUPPORTED_EVENT')

const wrongProject = await call(requestFor({ eventId: 'evt_wrongproject12345678', projectId: 'dev_otherproject1234' }))
assert.equal(wrongProject.statusCode, 403)
assert.equal(wrongProject.body.error.code, 'PROJECT_MISMATCH')

const wrongNetwork = await call(requestFor({ eventId: 'evt_wrongnetwork12345678', network: 'base', chainId: 8453 }))
assert.equal(wrongNetwork.statusCode, 400)
assert.equal(wrongNetwork.body.error.code, 'NETWORK_MISMATCH')

const nullBodySigned = buildDeveloperWebhookRequest(secret, 'agreement.activated', {}, {
  eventId: 'evt_nullpayload12345678',
  createdAt: now.toISOString(),
  attemptedAt: now.toISOString(),
})
const invalidRoot = await call({
  method: 'POST',
  body: Buffer.from('null'),
  headers: {
    'x-hashpaylink-event': 'evt_nullpayload12345678',
    'x-hashpaylink-signature': `t=${nullBodySigned.timestamp},v1=${
      createHmac('sha256', secret)
        .update(`${nullBodySigned.timestamp}.null`)
        .digest('hex')
    }`,
  },
})
assert.equal(invalidRoot.statusCode, 400)
assert.equal(invalidRoot.body.error.code, 'INVALID_PAYLOAD')

const conflictRequest = requestFor()
const conflictPayload = JSON.parse(conflictRequest.body.toString('utf8'))
conflictPayload.data.status = 'completed'
const conflictSigned = buildDeveloperWebhookRequest(secret, conflictPayload.event, conflictPayload.data, {
  eventId: conflictPayload.id,
  createdAt: conflictPayload.createdAt,
  attemptedAt: now.toISOString(),
})
const conflict = await call({
  ...conflictRequest,
  body: Buffer.from(conflictSigned.payload),
  headers: {
    'x-hashpaylink-event': conflictPayload.id,
    'x-hashpaylink-signature': `t=${conflictSigned.timestamp},v1=${conflictSigned.signature}`,
  },
})
assert.equal(conflict.statusCode, 409)
assert.equal(conflict.body.error.code, 'EVENT_CONFLICT')

const unavailable = createHashPayStreamArcWebhookHandler({
  ...dependencies,
  hasStore: () => false,
})
const unavailableResponse = responseRecorder()
await unavailable(/** @type {any} */ (requestFor()), /** @type {any} */ (unavailableResponse))
assert.equal(unavailableResponse.statusCode, 503)
assert.equal(unavailableResponse.body.error.code, 'STORE_UNAVAILABLE')

const missingConfiguration = createHashPayStreamArcWebhookHandler({
  ...dependencies,
  env: () => ({}),
})
const missingConfigurationResponse = responseRecorder()
await missingConfiguration(
  /** @type {any} */ (requestFor()),
  /** @type {any} */ (missingConfigurationResponse),
)
assert.equal(missingConfigurationResponse.statusCode, 503)
assert.equal(missingConfigurationResponse.body.error.code, 'WEBHOOK_NOT_CONFIGURED')

const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(source, /app\.post\(\s*'\/api\/hashpaystream\/arc-agreement-webhook'/)
assert.ok(
  source.indexOf("'/api/hashpaystream/arc-agreement-webhook'")
  < source.indexOf("app.use(express.json({ limit: '256kb' }))"),
  'Raw signed webhook route must be mounted before the global JSON parser.',
)

console.log('Hash PayStream Arc Agreement webhook smoke checks passed.')

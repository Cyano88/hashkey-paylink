import assert from 'node:assert/strict'
import { createVerifiedArcRecipientsHandler, signVerifiedArcRecipientRegistration } from '../api/arc-agreement-verified-recipients.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}
async function request(handler, { body = {}, headers = {}, method = 'POST' } = {}) {
  const response = responseRecorder()
  await handler({ method, body, headers }, response)
  return response
}

const secret = 'registry-secret-that-is-longer-than-thirty-two-bytes'
const apiKey = 'hpl_test_registry_project_key'
const recipient = '0x2222222222222222222222222222222222222222'
const accountReference = 'a'.repeat(64)
const now = new Date('2026-08-28T12:00:00.000Z')
const timestamp = String(Math.floor(now.getTime() / 1000))
const humanPolicy = {
  partnerId: 'dev_hashpaystream_direct',
  merchantName: 'HashPayStream',
  allowedOrigins: ['https://hashpaystream.app'],
  defaultNetwork: 'arc',
  paymentOptions: [{ network: 'arc', recipient: '0x1111111111111111111111111111111111111111' }],
  settlementMode: 'usdc',
  environment: 'test',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
  webhookConfigured: true,
  projectManaged: true,
}
let store
let policy = humanPolicy
const handler = createVerifiedArcRecipientsHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => { store = update(store); return store },
  policy: async () => policy,
  env: () => ({ ARC_AGREEMENT_VERIFIED_RECIPIENT_SECRET: secret }),
  now: () => now,
})

const signature = signVerifiedArcRecipientRegistration({ secret, apiKey, timestamp, recipient, accountReference })
const headers = { 'x-api-key': apiKey, 'x-recipient-timestamp': timestamp, 'x-recipient-signature': signature }

const unauthorized = await request(handler, { body: { recipient, accountReference }, headers: { ...headers, 'x-recipient-signature': '0'.repeat(64) } })
assert.equal(unauthorized.statusCode, 401)

const registered = await request(handler, { body: { recipient, accountReference }, headers })
assert.equal(registered.statusCode, 201)
assert.equal(registered.body.recipient.toLowerCase(), recipient.toLowerCase())
assert.equal(store.projects[humanPolicy.partnerId][recipient.toLowerCase()].accountReference, accountReference)

const replayed = await request(handler, { body: { recipient, accountReference }, headers })
assert.equal(replayed.statusCode, 200)
assert.equal(replayed.body.replayed, true)

const otherReference = 'b'.repeat(64)
const otherSignature = signVerifiedArcRecipientRegistration({ secret, apiKey, timestamp, recipient, accountReference: otherReference })
const conflict = await request(handler, { body: { recipient, accountReference: otherReference }, headers: { ...headers, 'x-recipient-signature': otherSignature } })
assert.equal(conflict.statusCode, 409)

const crossProjectKey = 'hpl_test_other_project_key'
policy = { ...humanPolicy, partnerId: 'dev_other_project' }
const replayedAcrossProject = await request(handler, { body: { recipient, accountReference }, headers: { ...headers, 'x-api-key': crossProjectKey } })
assert.equal(replayedAcrossProject.statusCode, 401)

policy = { ...humanPolicy, checkoutMode: 'agentic' }
const agentRejected = await request(handler, { body: { recipient, accountReference }, headers })
assert.equal(agentRejected.statusCode, 403)

policy = humanPolicy
const staleTimestamp = String(Number(timestamp) - 301)
const staleSignature = signVerifiedArcRecipientRegistration({ secret, apiKey, timestamp: staleTimestamp, recipient, accountReference })
const stale = await request(handler, { body: { recipient, accountReference }, headers: { ...headers, 'x-recipient-timestamp': staleTimestamp, 'x-recipient-signature': staleSignature } })
assert.equal(stale.statusCode, 401)

console.log('arc agreement verified recipient smoke test passed')
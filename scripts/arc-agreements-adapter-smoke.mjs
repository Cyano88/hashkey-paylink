import assert from 'node:assert/strict'
import { createArcAgreementsHandler } from '../api/arc-agreements.ts'

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

async function request(handler, method, { body, headers = {}, query = {} } = {}) {
  const response = responseRecorder()
  await handler({ method, body, headers, query }, response)
  return response
}

const arcRoute = [{ network: 'arc', recipient: '0x1111111111111111111111111111111111111111' }]
const humanPolicy = {
  partnerId: 'project_human',
  merchantName: 'Creator Studio',
  allowedOrigins: ['https://creator.example'],
  defaultNetwork: 'arc',
  paymentOptions: arcRoute,
  settlementMode: 'usdc',
  environment: 'test',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
  webhookConfigured: false,
  projectManaged: true,
}

let store
let policy = humanPolicy
let id = 0
const handler = createArcAgreementsHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  policy: async () => policy,
  createId: () => `agr_testagreement${(++id).toString().padStart(4, '0')}`,
  now: () => new Date('2026-07-28T12:00:00.000Z'),
})

const fixed = {
  template: 'fixed_unlock',
  externalId: 'order-0001',
  resourceId: 'content:research-0001',
  title: 'Premium research access',
  description: 'Unlock one premium research report.',
  amount: '10.500000',
  recipient: '0x2222222222222222222222222222222222222222',
}
const headers = { 'x-api-key': 'hpl_test_mock', 'idempotency-key': 'agreement:order-0001' }

policy = { ...humanPolicy, capabilities: ['hosted_checkout'] }
assert.equal((await request(handler, 'POST', { body: fixed, headers })).statusCode, 403)

policy = { ...humanPolicy, environment: 'live' }
assert.equal((await request(handler, 'POST', { body: fixed, headers })).statusCode, 403)

policy = { ...humanPolicy, paymentOptions: [{ network: 'base', recipient: arcRoute[0].recipient }], defaultNetwork: 'base' }
assert.equal((await request(handler, 'POST', { body: fixed, headers })).statusCode, 409)

policy = humanPolicy
assert.equal((await request(handler, 'POST', { body: fixed, headers: { 'x-api-key': 'hpl_test_mock' } })).statusCode, 400)

const created = await request(handler, 'POST', { body: fixed, headers })
assert.equal(created.statusCode, 201)
assert.equal(created.headers['cache-control'], 'no-store')
assert.equal(created.body.replayed, false)
assert.equal(created.body.agreement.checkoutMode, 'human')
assert.equal(created.body.agreement.environment, 'test')
assert.equal(created.body.agreement.network, 'arc')
assert.equal(created.body.agreement.amount, '10.5')
assert.equal(created.body.agreement.durationSeconds, 86400)
assert.equal(created.body.agreement.cancellationWindowSeconds, 900)
assert.match(created.body.agreement.termsHash, /^0x[a-f0-9]{64}$/)
assert.match(created.body.agreement.clientReference, /^0x[a-f0-9]{64}$/)
assert.equal(created.body.agreement.chainTerms.amountUsdcUnits, '10500000')
assert.deepEqual(created.body.agreement.chainTerms.cumulativeReleaseBps, [10000])
assert.equal(created.body.agreement.status, 'draft')
assert.equal(created.body.agreement.activationStatus, 'contract_unavailable')
assert.equal('requestHash' in created.body.agreement, false)
assert.match(created.body.nextAction, /No funds have moved/)
assert.equal(JSON.stringify(created.body).includes('checkoutUrl'), false)
assert.equal(JSON.stringify(created.body).includes('depositAddress'), false)

const replay = await request(handler, 'POST', { body: fixed, headers })
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.replayed, true)
assert.equal(replay.body.agreement.id, created.body.agreement.id)

const conflict = await request(handler, 'POST', { body: { ...fixed, amount: '11' }, headers })
assert.equal(conflict.statusCode, 409)
assert.match(conflict.body.error, /different agreement request/)

const read = await request(handler, 'GET', { query: { id: created.body.agreement.id } })
assert.equal(read.statusCode, 200)
assert.equal(read.body.agreement.resourceId, fixed.resourceId)
assert.equal('requestHash' in read.body.agreement, false)

policy = { ...humanPolicy, partnerId: 'project_other' }
assert.equal((await request(handler, 'GET', { query: { id: created.body.agreement.id } })).statusCode, 404)

policy = { ...humanPolicy, partnerId: 'project_agent', checkoutMode: 'agentic' }
const agentCreated = await request(handler, 'POST', {
  headers: { ...headers, 'idempotency-key': 'agreement:agent-0001' },
  body: { ...fixed, externalId: 'agent-0001', resourceId: 'service:agent-report' },
})
assert.equal(agentCreated.statusCode, 201)
assert.equal(agentCreated.body.agreement.checkoutMode, 'agentic')

policy = humanPolicy
const progressiveHeaders = { ...headers, 'idempotency-key': 'agreement:progressive-0001' }
const progressive = {
  ...fixed,
  template: 'progressive_release',
  externalId: 'progressive-0001',
  resourceId: 'article:long-read',
  checkpoints: [{ percentage: 25 }, { percentage: 50 }, { percentage: 75 }],
}
assert.equal((await request(handler, 'POST', { headers: progressiveHeaders, body: progressive })).statusCode, 400)
const progressiveCreated = await request(handler, 'POST', {
  headers: progressiveHeaders,
  body: { ...progressive, checkpoints: [...progressive.checkpoints, { percentage: 100 }] },
})
assert.equal(progressiveCreated.statusCode, 201)
assert.deepEqual(progressiveCreated.body.agreement.checkpoints.map(item => item.percentage), [25, 50, 75, 100])
assert.deepEqual(progressiveCreated.body.agreement.chainTerms.cumulativeReleaseBps, [2500, 5000, 7500, 10000])

const roundedToZero = await request(handler, 'POST', {
  headers: { ...headers, 'idempotency-key': 'agreement:rounding-lock' },
  body: {
    ...progressive,
    externalId: 'rounding-lock',
    amount: '0.000001',
    checkpoints: [{ percentage: 50 }, { percentage: 100 }],
  },
})
assert.equal(roundedToZero.statusCode, 400)
assert.match(roundedToZero.body.error, /too small for this release schedule/i)

const milestoneHeaders = { ...headers, 'idempotency-key': 'agreement:milestone-0001' }
const milestone = {
  ...fixed,
  template: 'milestone',
  externalId: 'milestone-0001',
  resourceId: 'job:design-0001',
  milestones: [{ label: 'Draft', percentage: 40 }, { label: 'Delivery', percentage: 50 }],
}
assert.equal((await request(handler, 'POST', { headers: milestoneHeaders, body: milestone })).statusCode, 400)
const milestoneCreated = await request(handler, 'POST', {
  headers: milestoneHeaders,
  body: { ...milestone, milestones: [{ label: 'Draft', percentage: 40 }, { label: 'Delivery', percentage: 60 }] },
})
assert.equal(milestoneCreated.statusCode, 201)
assert.equal(milestoneCreated.body.agreement.milestones.reduce((total, item) => total + item.percentage, 0), 100)
assert.deepEqual(milestoneCreated.body.agreement.chainTerms.cumulativeReleaseBps, [4000, 10000])

assert.equal((await request(handler, 'POST', {
  headers: { ...headers, 'idempotency-key': 'agreement:invalid-duration' },
  body: { ...fixed, externalId: 'invalid-duration', durationSeconds: 3599 },
})).statusCode, 400)
assert.equal((await request(handler, 'POST', {
  headers: { ...headers, 'idempotency-key': 'agreement:invalid-cancel-window' },
  body: { ...fixed, externalId: 'invalid-cancel-window', durationSeconds: 3600, cancellationWindowSeconds: 3600 },
})).statusCode, 400)

assert.equal((await request(handler, 'POST', {
  headers: { ...headers, 'idempotency-key': 'agreement:fixed-schedule' },
  body: { ...fixed, externalId: 'fixed-schedule', checkpoints: [{ percentage: 100 }] },
})).statusCode, 400)

console.log('Arc Agreements adapter smoke checks passed.')

import assert from 'node:assert/strict'
import {
  createArcAgreementsHandler,
  readArcAgreementByPayerAccess,
  rotateArcAgreementPayerAccess,
} from '../api/arc-agreements.ts'
import { requestArcAgreementRelease } from '../api/arc-agreement-creator-actions.ts'

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
  partnerId: 'dev_projecthuman1234',
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
  hasActivationAttempt: async () => false,
  listOperatorActions: async () => [],
  listActivationAttempts: async () => [],
  listPayerLifecycleActions: async () => [],
  createId: () => `agr_testagreement${(++id).toString().padStart(4, '0')}`,
  createPayerAccessToken: () => `agrp_${String(id + 1).padStart(43, 'a')}`,
  now: () => new Date('2026-07-28T12:00:00.000Z'),
})

const fixed = {
  template: 'fixed_unlock',
  externalId: 'order-0001',
  resourceId: 'content:research-0001',
  title: 'Premium research access',
  description: 'Unlock one premium research report.',
  amount: '10.500000',
  recipient: arcRoute[0].recipient,
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

const recipientMismatch = await request(handler, 'POST', {
  body: { ...fixed, recipient: '0x2222222222222222222222222222222222222222' },
  headers,
})
assert.equal(recipientMismatch.statusCode, 409)
assert.equal(recipientMismatch.body.error, "Recipient must match this project's configured Arc Testnet receiving address.")

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
assert.equal(created.body.agreement.activationStatus, 'private_pilot')
assert.equal('requestHash' in created.body.agreement, false)
assert.equal('payerAccessHash' in created.body.agreement, false)
assert.match(created.body.payerAccessToken, /^agrp_[A-Za-z0-9_-]{40,100}$/)
assert.equal(created.body.payerReviewPath, `/agreements/${created.body.agreement.id}#access=${created.body.payerAccessToken}`)
assert.match(created.body.nextAction, /Send payerReviewPath to the payer/)
assert.match(created.body.nextAction, /private Arc Testnet pilot/)
assert.equal(JSON.stringify(created.body).includes('checkoutUrl'), false)
assert.equal(JSON.stringify(created.body).includes('depositAddress'), false)

const originalPayerAccessToken = created.body.payerAccessToken
const originalPayerAccessHash = store.agreements[created.body.agreement.id].payerAccessHash
const rotatedPayerAccessToken = `agrp_${'z'.repeat(43)}`
const rotated = await rotateArcAgreementPayerAccess(
  humanPolicy.partnerId,
  created.body.agreement.id,
  {
    hasStore: () => true,
    mutate: async (_key, update) => {
      store = update(store)
      return store
    },
    createPayerAccessToken: () => rotatedPayerAccessToken,
    now: () => new Date('2026-07-28T13:00:00.000Z'),
  },
)
assert.equal(rotated.payerAccessToken, rotatedPayerAccessToken)
assert.equal(rotated.payerReviewPath, `/agreements/${created.body.agreement.id}#access=${rotatedPayerAccessToken}`)
assert.equal('payerAccessHash' in rotated.agreement, false)
assert.notEqual(store.agreements[created.body.agreement.id].payerAccessHash, originalPayerAccessHash)
assert.equal(await readArcAgreementByPayerAccess(created.body.agreement.id, originalPayerAccessToken, async () => store), null)
assert.equal(
  (await readArcAgreementByPayerAccess(created.body.agreement.id, rotatedPayerAccessToken, async () => store))?.id,
  created.body.agreement.id,
)

const replay = await request(handler, 'POST', { body: fixed, headers })
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.replayed, true)
assert.equal(replay.body.agreement.id, created.body.agreement.id)
assert.equal('payerAccessToken' in replay.body, false)

const conflict = await request(handler, 'POST', { body: { ...fixed, amount: '11' }, headers })
assert.equal(conflict.statusCode, 409)
assert.match(conflict.body.error, /different agreement request/)

const read = await request(handler, 'GET', { query: { id: created.body.agreement.id } })
assert.equal(read.statusCode, 200)
assert.equal(read.body.agreement.resourceId, fixed.resourceId)
assert.equal('requestHash' in read.body.agreement, false)

const listed = await request(handler, 'GET', { query: { limit: '10' } })
assert.equal(listed.statusCode, 200)
assert.equal(listed.body.agreements.length, 1)
assert.equal(listed.body.agreements[0].id, created.body.agreement.id)
assert.equal('payerAccessHash' in listed.body.agreements[0], false)
assert.equal(listed.body.agreements[0].releaseRequest, null)

const completedAction = {
  id: `opa_${'4'.repeat(24)}`,
  partnerId: humanPolicy.partnerId,
  agreementId: created.body.agreement.id,
  action: 'release',
  step: 0,
  evidenceHash: `0x${'5'.repeat(64)}`,
  evidenceReference: 'https://delivery.example/proof',
  deliveryNote: 'Completed the protected delivery.',
  reviewPolicy: 'payer',
  preparedCall: {},
  requestHash: '6'.repeat(64),
  idempotencyKey: '00000000-0000-4000-8000-000000000000',
  requestedBy: 'developer-api:test',
  requestedAt: '2026-07-28T15:00:00.000Z',
  reviewedAt: '2026-07-28T15:05:00.000Z',
  completedAt: '2026-07-28T15:06:00.000Z',
  transactionHash: `0x${'7'.repeat(64)}`,
  status: 'completed',
  attempts: 1,
  updatedAt: '2026-07-28T15:06:00.000Z',
}
const completedRead = await request(createArcAgreementsHandler({
  hasStore: () => true,
  read: async () => store,
  policy: async () => humanPolicy,
  listOperatorActions: async () => [completedAction],
  listPayerLifecycleActions: async () => [],
  listActivationAttempts: async () => [{
    agreementId: created.body.agreement.id,
    partnerId: humanPolicy.partnerId,
    status: 'active',
    escrow: '0x3333333333333333333333333333333333333333',
    prepared: {
      agreementId: `0x${'8'.repeat(64)}`,
      termsHash: created.body.agreement.termsHash,
      payer: '0x4444444444444444444444444444444444444444',
      recipient: created.body.agreement.recipient,
      totalAmount: '10500000',
      cumulativeReleaseBps: [10000],
    },
    lifecycle: {
      status: 'completed',
      nextStep: 1,
      releasedAmountUsdcUnits: '10500000',
      eventId: `evt_${'9'.repeat(24)}`,
      observedBlockNumber: '100',
      observedAt: '2026-07-28T15:06:00.000Z',
    },
    updatedAt: '2026-07-28T15:06:00.000Z',
  }],
}), 'GET', { query: { id: created.body.agreement.id } })
assert.equal(completedRead.statusCode, 200)
assert.equal(completedRead.body.agreement.status, 'completed')
assert.equal(completedRead.body.agreement.chain.releasedUsdcUnits, '10500000')
assert.equal(completedRead.body.receipt.source, 'arc-agreement')
assert.equal(completedRead.body.receipt.agreementStatus, 'completed')
assert.equal(completedRead.body.receipt.txHash, completedAction.transactionHash)
assert.deepEqual(completedRead.body.agreement.deliveryTimeline, [
  {
    id: `${completedAction.id}:submitted`,
    event: 'delivery.submitted',
    createdAt: completedAction.requestedAt,
  },
  {
    id: `${completedAction.id}:approved`,
    event: 'delivery.release_approved',
    createdAt: completedAction.reviewedAt,
  },
])
assert.equal(JSON.stringify(completedRead.body).includes(completedAction.evidenceHash), false)

const apiRotatedToken = `agrp_${'y'.repeat(43)}`
const apiRotated = await request(createArcAgreementsHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  policy: async () => humanPolicy,
  hasActivationAttempt: async () => false,
  createPayerAccessToken: () => apiRotatedToken,
  now: () => new Date('2026-07-28T14:00:00.000Z'),
}), 'POST', {
  body: { action: 'rotate_payer_link', agreementId: created.body.agreement.id },
  headers: { 'x-api-key': 'hpl_test_mock' },
})
assert.equal(apiRotated.statusCode, 200)
assert.equal(apiRotated.body.payerAccessToken, apiRotatedToken)
assert.equal(apiRotated.body.payerReviewPath, `/agreements/${created.body.agreement.id}#access=${apiRotatedToken}`)

const apiRotationBlocked = await request(createArcAgreementsHandler({
  hasStore: () => true,
  read: async () => store,
  policy: async () => humanPolicy,
  hasActivationAttempt: async () => true,
}), 'POST', {
  body: { action: 'rotate_payer_link', agreementId: created.body.agreement.id },
  headers: { 'x-api-key': 'hpl_test_mock' },
})
assert.equal(apiRotationBlocked.statusCode, 409)
assert.match(apiRotationBlocked.body.error, /activation has started/)

let releaseInput
const publicRelease = await request(createArcAgreementsHandler({
  hasStore: () => true,
  read: async () => store,
  policy: async () => humanPolicy,
  requestRelease: async input => {
    releaseInput = input
    return {
      replayed: false,
      action: {
        id: `opa_${'1'.repeat(24)}`,
        partnerId: input.partnerId,
        agreementId: input.agreementId,
        action: 'release',
        step: 0,
        evidenceHash: `0x${'2'.repeat(64)}`,
        evidenceReference: 'https://delivery.example/proof',
        deliveryNote: 'Completed the protected delivery.',
        reviewPolicy: 'payer',
        preparedCall: {},
        requestHash: '3'.repeat(64),
        idempotencyKey: '00000000-0000-4000-8000-000000000000',
        requestedBy: input.requestedBy,
        requestedAt: '2026-07-28T15:00:00.000Z',
        status: 'awaiting_review',
        attempts: 0,
        updatedAt: '2026-07-28T15:00:00.000Z',
      },
    }
  },
}), 'POST', {
  body: {
    action: 'request_release',
    agreementId: created.body.agreement.id,
    deliveryNote: 'Completed the protected delivery.',
    evidenceReference: 'https://delivery.example/proof',
  },
  headers: { 'x-api-key': 'hpl_test_mock' },
})
assert.equal(publicRelease.statusCode, 201)
assert.equal(publicRelease.body.releaseRequest.status, 'awaiting_review')
assert.equal(publicRelease.body.releaseRequest.evidenceReference, 'https://delivery.example/proof')
assert.equal('evidenceHash' in publicRelease.body.releaseRequest, false)
assert.equal(releaseInput.partnerId, humanPolicy.partnerId)
assert.equal(releaseInput.requestedBy, `developer-api:${humanPolicy.partnerId}`)

const foreignRelease = await request(createArcAgreementsHandler({
  hasStore: () => true,
  read: async () => store,
  policy: async () => ({ ...humanPolicy, partnerId: 'dev_foreignproject1234' }),
  requestRelease: async () => { throw new Error('must not run') },
}), 'POST', {
  body: {
    action: 'request_release',
    agreementId: created.body.agreement.id,
    deliveryNote: 'Completed the protected delivery.',
    evidenceReference: 'https://delivery.example/proof',
  },
  headers: { 'x-api-key': 'hpl_test_mock' },
})
assert.equal(foreignRelease.statusCode, 404)

await assert.rejects(
  requestArcAgreementRelease({
    partnerId: humanPolicy.partnerId,
    agreementId: created.body.agreement.id,
    template: 'fixed_unlock',
    requestedBy: `developer-api:${humanPolicy.partnerId}`,
    deliveryNote: 'Completed the protected delivery.',
    evidenceReference: 'http://delivery.example/proof',
  }),
  error => error?.status === 400 && /secure HTTPS link/.test(error.message),
)

await assert.rejects(
  requestArcAgreementRelease({
    partnerId: humanPolicy.partnerId,
    agreementId: created.body.agreement.id,
    template: 'fixed_unlock',
    requestedBy: `developer-api:${humanPolicy.partnerId}`,
    deliveryNote: 'Completed the protected delivery.',
    evidenceReference: 'https://delivery.example/proof',
  }, {
    binding: async () => { throw new Error('Arc Agreement lifecycle actions require a durably active escrow.') },
  }),
  error => error?.status === 409 && /must be active/.test(error.message),
)

policy = { ...humanPolicy, partnerId: 'project_other' }
assert.equal((await request(handler, 'GET', { query: { id: created.body.agreement.id } })).statusCode, 404)

policy = { ...humanPolicy, partnerId: 'project_agent', checkoutMode: 'agentic' }
const agentCreated = await request(handler, 'POST', {
  headers: { ...headers, 'idempotency-key': 'agreement:agent-0001' },
  body: { ...fixed, externalId: 'agent-0001', resourceId: 'service:agent-report' },
})
assert.equal(agentCreated.statusCode, 201)
assert.equal(agentCreated.body.agreement.checkoutMode, 'agentic')
assert.equal('payerAccessToken' in agentCreated.body, false)
assert.equal('payerReviewPath' in agentCreated.body, false)
assert.match(agentCreated.body.nextAction, /\/api\/v2\/agreements\/agent/)
assert.equal(store.agreements[agentCreated.body.agreement.id].payerAccessHash, '')
const agentRotationBlocked = await request(handler, 'POST', {
  headers: { 'x-api-key': 'hpl_test_mock' },
  body: { action: 'rotate_payer_link', agreementId: agentCreated.body.agreement.id },
})
assert.equal(agentRotationBlocked.statusCode, 409)
assert.match(agentRotationBlocked.body.error, /do not use human payer links/)

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

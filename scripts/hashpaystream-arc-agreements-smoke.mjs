import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHashPayStreamArcAgreementsHandler } from '../api/hashpaystream-arc-agreements.ts'

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
const agreementId = 'agr_hashpaystream12345678'
const ownerId = 'did:privy:hashpaystream-owner'
let authorizedProject = ''
let operatorActions = []
let operatorActionSequence = 0
let expectedStep = 0
let expectedDelivery = {
  note: 'Completed the agreed website delivery.',
  url: 'https://delivery.example/proof',
}

const draft = {
  id: agreementId,
  partnerId: projectId,
  checkoutMode: 'human',
  environment: 'test',
  network: 'arc',
  template: 'fixed_unlock',
  externalId: 'pilot-1',
  resourceId: 'resource-1',
  title: 'Hash PayStream pilot agreement',
  description: 'Protected Arc payment.',
  amount: '0.1',
  recipient: '0x24e57cdCE0F947e97C51Df9fd7969061ca1cABF2',
  durationSeconds: 7200,
  cancellationWindowSeconds: 900,
  termsHash: `0x${'1'.repeat(64)}`,
  clientReference: `0x${'2'.repeat(64)}`,
  chainTerms: {},
  status: 'draft',
  activationStatus: 'private_pilot',
  requestHash: 'private-request-hash',
  payerAccessHash: 'private-payer-access-hash',
  createdAt: '2026-07-31T12:00:00.000Z',
  updatedAt: '2026-07-31T12:00:00.000Z',
}

function event(id, eventName, block, data = {}) {
  return {
    id,
    event: eventName,
    projectId,
    agreementId,
    createdAt: `2026-07-31T1${block === '20' ? '3' : '2'}:00:00.000Z`,
    receivedAt: `2026-07-31T1${block === '20' ? '3' : '2'}:00:01.000Z`,
    payloadHash: 'must-never-leave-the-api',
    duplicateCount: 0,
    data: {
      partnerId: projectId,
      agreementId,
      network: 'arc',
      chainId: 5_042_002,
      escrow: '0x4C556C9C362E1569CD2d3A0566a35237a2d81C78',
      onchainAgreementId: `0x${'3'.repeat(64)}`,
      termsHash: `0x${'1'.repeat(64)}`,
      amountUsdcUnits: '100000',
      releasedAmountUsdcUnits: '0',
      unreleasedAmountUsdcUnits: '100000',
      nextStep: 0,
      releaseSteps: 1,
      observedBlockNumber: block,
      ...data,
    },
  }
}

const dependencies = {
  hasStore: () => true,
  authorize: async (_req, id) => {
    authorizedProject = id
    return { id, ownerId, name: 'Hash PayStream Arc Pilot', capabilities: ['arc_agreements'] }
  },
  readEvents: async () => ({
    schema: 1,
    events: {
      activation: event('evt_hashpaystreamactivate12', 'agreement.activated', '10'),
      refund: event('evt_hashpaystreamrefund123', 'agreement.refunded', '20'),
      foreign: {
        ...event('evt_hashpaystreamforeign123', 'agreement.activated', '999'),
        projectId: 'dev_anotherproject1234',
        agreementId: 'agr_foreignagreement1234',
      },
    },
  }),
  listAgreements: async input => {
    assert.deepEqual(input, { partnerId: projectId, limit: 250 })
    return [draft]
  },
  projectPolicy: async id => ({
    partnerId: id,
    merchantName: 'Hash PayStream Arc Pilot',
    allowedOrigins: ['https://hashpaystream.app'],
    defaultNetwork: 'arc',
    paymentOptions: [{ network: 'arc', recipient: draft.recipient }],
    settlementMode: 'usdc',
    environment: 'test',
    checkoutMode: 'human',
    capabilities: ['arc_agreements'],
    webhookConfigured: true,
    projectManaged: true,
  }),
  createAgreement: async (req, res, policy) => {
    assert.equal(policy.partnerId, projectId)
    assert.ok(['fixed_unlock', 'milestone'].includes(req.body.template))
    assert.match(req.body.externalId, /^hps-[a-f0-9]{20}$/)
    assert.match(req.body.resourceId, /^agreement:[a-f0-9]{20}$/)
    assert.equal(req.body.amount, '0.1')
    if (req.body.template === 'fixed_unlock') {
      assert.equal(req.body.title, 'New protected payment')
      assert.equal(req.originalBody.externalId, 'must-not-pass-through')
      assert.notEqual(req.body.externalId, req.originalBody.externalId)
    } else {
      assert.equal(req.body.title, 'Milestone delivery')
      assert.deepEqual(req.body.milestones, [
        { label: 'Design', percentage: 40 },
        { label: 'Launch', percentage: 60 },
      ])
    }
    return res.status(201).json({
      ok: true,
      agreement: { id: 'agr_createdagreement1234', title: req.body.title, amount: req.body.amount, recipient: req.body.recipient, template: req.body.template },
      payerReviewPath: '/agreements/agr_createdagreement1234#access=agrp_private',
    })
  },
  hasActivationAttempt: async () => false,
  rotatePayerAccess: async (partnerId, id) => {
    assert.equal(partnerId, projectId)
    assert.equal(id, agreementId)
    return {
      agreement: draft,
      payerAccessToken: `agrp_${'r'.repeat(43)}`,
      payerReviewPath: `/agreements/${agreementId}#access=agrp_rotated_private`,
    }
  },
  listOperatorActions: async input => {
    assert.equal(input.partnerId, projectId)
    return operatorActions
  },
  binding: async (partnerId, id) => {
    assert.equal(partnerId, projectId)
    assert.equal(id, agreementId)
    return {
      partnerId,
      agreementId: id,
      escrow: '0x4C556C9C362E1569CD2d3A0566a35237a2d81C78',
      prepared: { cumulativeReleaseBps: [10_000] },
    }
  },
  confirmed: async () => ({
    snapshot: {
      status: 1,
      nextStep: 0,
      operator: '0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49',
    },
    observedBlockNumber: 100n,
  }),
  operatorClient: () => ({
    operatorWallet: async () => ({
      walletId: 'operator-wallet-id',
      address: '0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49',
    }),
  }),
  chainClient: () => ({}),
  prepareRelease: input => ({
    walletId: input.operatorWallet.walletId,
    operatorAddress: input.operatorWallet.address,
    contractAddress: '0x4C556C9C362E1569CD2d3A0566a35237a2d81C78',
    abiFunctionSignature: 'releaseStep(uint8,bytes32)',
    abiParameters: [input.step, input.evidenceHash],
    idempotencyKey: input.idempotencyKey,
    refId: `${input.agreementId}:release:${input.step}`,
  }),
  createOperatorAction: async input => {
    assert.equal(input.partnerId, projectId)
    assert.equal(input.agreementId, agreementId)
    assert.equal(input.action, 'release')
    assert.equal(input.step, expectedStep)
    assert.equal(input.requestedBy, ownerId)
    assert.match(input.evidenceHash, /^0x[a-f0-9]{64}$/)
    assert.equal(input.evidenceReference, expectedDelivery.url)
    assert.equal(input.deliveryNote, expectedDelivery.note)
    assert.equal(input.reviewPolicy, 'payer')
    operatorActionSequence += 1
    const requestedAt = operatorActionSequence === 1
      ? '2026-08-01T00:45:00.000Z'
      : '2026-08-01T00:55:00.000Z'
    const operatorAction = {
      id: `opa_${String(operatorActionSequence).padStart(24, '0')}`,
      ...input,
      requestHash: 'a'.repeat(64),
      requestedAt,
      status: 'awaiting_review',
      attempts: 0,
      updatedAt: requestedAt,
    }
    operatorActions = [operatorAction, ...operatorActions]
    return operatorAction
  },
  env: () => ({ HASHPAYSTREAM_ARC_PROJECT_ID: projectId }),
}

async function call(handler, method = 'GET', input = {}) {
  const response = responseRecorder()
  const request = {
    method,
    headers: { authorization: 'Bearer test', ...(input.headers ?? {}) },
    body: input.body,
  }
  request.originalBody = request.body
  await handler(request, response)
  return response
}

const response = await call(createHashPayStreamArcAgreementsHandler(dependencies))
assert.equal(response.statusCode, 200)
assert.equal(response.headers['cache-control'], 'no-store')
assert.equal(authorizedProject, projectId)
assert.equal(response.body.project.name, 'Hash PayStream Arc Pilot')
assert.equal(response.body.summary.total, 1)
assert.equal(response.body.summary.closed, 1)
assert.equal(response.body.agreements.length, 1)
assert.equal(response.body.agreements[0].title, draft.title)
assert.equal(response.body.agreements[0].status, 'refunded')
assert.equal(response.body.agreements[0].chain.remainingUsdcUnits, '0')
assert.equal(response.body.agreements[0].timeline.length, 2)
assert.equal('payloadHash' in response.body.agreements[0].timeline[0], false)
assert.equal(JSON.stringify(response.body).includes('private-payer-access-hash'), false)
assert.equal(JSON.stringify(response.body).includes('must-never-leave-the-api'), false)

const created = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST', {
  headers: { 'idempotency-key': 'hashpaystream:create:1234' },
  body: {
    title: 'New protected payment',
    description: 'One protected test payment.',
    amount: '0.1',
    recipient: draft.recipient,
    durationSeconds: 7200,
    cancellationWindowSeconds: 900,
    externalId: 'must-not-pass-through',
    template: 'fixed_unlock',
  },
})
assert.equal(created.statusCode, 201)
assert.equal(created.body.agreement.title, 'New protected payment')

const milestoneCreated = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST', {
  headers: { 'idempotency-key': 'hashpaystream:create:milestone:1234' },
  body: {
    template: 'milestone',
    title: 'Milestone delivery',
    description: 'Release each approved delivery step.',
    amount: '0.1',
    recipient: draft.recipient,
    durationSeconds: 7200,
    cancellationWindowSeconds: 900,
    milestones: [
      { label: 'Design', percentage: 40 },
      { label: 'Launch', percentage: 60 },
    ],
  },
})
assert.equal(milestoneCreated.statusCode, 201)
assert.equal(milestoneCreated.body.agreement.template, 'milestone')

const releaseRequested = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST', {
  body: {
    action: 'request_release',
    agreementId,
    deliveryNote: 'Completed the agreed website delivery.',
    evidenceReference: 'https://delivery.example/proof',
  },
})
assert.equal(releaseRequested.statusCode, 201)
assert.equal(releaseRequested.body.releaseRequest.status, 'awaiting_review')
assert.equal('evidenceHash' in releaseRequested.body.releaseRequest, false)
assert.equal(releaseRequested.body.releaseRequest.evidenceReference, 'https://delivery.example/proof')
assert.equal(releaseRequested.body.releaseRequest.deliveryNote, 'Completed the agreed website delivery.')

const deliverySubmitted = await call(createHashPayStreamArcAgreementsHandler(dependencies))
assert.deepEqual(deliverySubmitted.body.agreements[0].deliveryTimeline.map(item => item.event), ['delivery.submitted'])

const releaseReplayed = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST', {
  body: {
    action: 'request_release',
    agreementId,
    deliveryNote: 'A different description should not replace the durable request.',
    evidenceReference: 'https://delivery.example/another-proof',
  },
})
assert.equal(releaseReplayed.statusCode, 200)
assert.equal(releaseReplayed.body.replayed, true)

const disputedActionId = operatorActions[0].id
operatorActions[0] = {
  ...operatorActions[0],
  status: 'disputed',
  reviewedAt: '2026-08-01T00:50:00.000Z',
  reviewNote: 'Please add the final handoff file.',
  updatedAt: '2026-08-01T00:50:00.000Z',
}
const issueReported = await call(createHashPayStreamArcAgreementsHandler(dependencies))
assert.deepEqual(issueReported.body.agreements[0].deliveryTimeline.map(item => item.event), [
  'delivery.submitted',
  'delivery.issue_reported',
])
expectedDelivery = {
  note: 'Added the requested final handoff file.',
  url: 'https://delivery.example/revised-proof',
}
const revisedDelivery = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST', {
  body: {
    action: 'request_release',
    agreementId,
    deliveryNote: expectedDelivery.note,
    evidenceReference: expectedDelivery.url,
  },
})
assert.equal(revisedDelivery.statusCode, 201)
assert.notEqual(revisedDelivery.body.releaseRequest.id, disputedActionId)
assert.equal(revisedDelivery.body.releaseRequest.status, 'awaiting_review')

const deliveryUpdated = await call(createHashPayStreamArcAgreementsHandler(dependencies))
assert.deepEqual(deliveryUpdated.body.agreements[0].deliveryTimeline.map(item => item.event), [
  'delivery.submitted',
  'delivery.issue_reported',
  'delivery.updated',
])

expectedStep = 1
expectedDelivery = {
  note: 'Completed the launch milestone delivery.',
  url: 'https://delivery.example/launch-proof',
}
const milestoneRelease = await call(createHashPayStreamArcAgreementsHandler({
  ...dependencies,
  listAgreements: async () => [{
    ...draft,
    template: 'milestone',
    milestones: [
      { label: 'Design', percentage: 40 },
      { label: 'Launch', percentage: 60 },
    ],
  }],
  binding: async () => ({
    partnerId: projectId,
    agreementId,
    escrow: '0x4C556C9C362E1569CD2d3A0566a35237a2d81C78',
    prepared: { cumulativeReleaseBps: [4_000, 10_000] },
  }),
  confirmed: async () => ({
    snapshot: {
      status: 1,
      nextStep: 1,
      operator: '0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49',
    },
    observedBlockNumber: 101n,
  }),
}), 'POST', {
  body: {
    action: 'request_release',
    agreementId,
    deliveryNote: expectedDelivery.note,
    evidenceReference: expectedDelivery.url,
  },
})
assert.equal(milestoneRelease.statusCode, 201)
assert.equal(milestoneRelease.body.releaseRequest.step, 1)

const rotated = await call(createHashPayStreamArcAgreementsHandler({
  ...dependencies,
  readEvents: async () => ({ schema: 1, events: {} }),
}), 'POST', {
  body: { action: 'rotate_payer_link', agreementId },
})
assert.equal(rotated.statusCode, 200)
assert.equal(rotated.body.payerReviewPath, `/agreements/${agreementId}#access=agrp_rotated_private`)

const rotationBlocked = await call(createHashPayStreamArcAgreementsHandler({
  ...dependencies,
  readEvents: async () => ({ schema: 1, events: {} }),
  hasActivationAttempt: async () => true,
}), 'POST', { body: { action: 'rotate_payer_link', agreementId } })
assert.equal(rotationBlocked.statusCode, 409)

const rotationBlockedByLifecycle = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST', {
  body: { action: 'rotate_payer_link', agreementId },
})
assert.equal(rotationBlockedByLifecycle.statusCode, 409)

const methodResponse = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'PUT')
assert.equal(methodResponse.statusCode, 405)
assert.equal(methodResponse.headers.allow, 'GET, POST')

const unauthorized = await call(createHashPayStreamArcAgreementsHandler({
  ...dependencies,
  authorize: async () => { throw Object.assign(new Error('Sign in first.'), { status: 401 }) },
}))
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error, 'Sign in first.')

const wrongCapability = await call(createHashPayStreamArcAgreementsHandler({
  ...dependencies,
  authorize: async () => ({ id: projectId, ownerId, name: 'Project', capabilities: ['hosted_checkout'] }),
}))
assert.equal(wrongCapability.statusCode, 403)

const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /app\.get\('\/api\/hashpaystream\/arc-agreements',\s*readLimiter/)
assert.match(serverSource, /app\.post\('\/api\/hashpaystream\/arc-agreements',\s*strictLimiter/)
const appSource = readFileSync(new URL('../modules/streampay/src/StreamPayApp.tsx', import.meta.url), 'utf8')
assert.match(appSource, /<Route index element={<AgreementDashboard\s*\/>}/)
assert.match(appSource, /path="agreements\/new" element={<FixedAgreementForm\s*\/>}/)
const formSource = readFileSync(new URL('../modules/streampay/src/components/agreements/FixedAgreementForm.tsx', import.meta.url), 'utf8')
assert.match(formSource, /fetch\('\/api\/hashpaystream\/arc-agreements'/)
assert.match(formSource, /'idempotency-key': idempotencyKey/)
assert.match(formSource, /template === 'milestone'/)
assert.match(formSource, /Milestone shares must total 100%/)
assert.match(formSource, /Add milestone/)
assert.match(formSource, /const formReady =/)
assert.match(formSource, /disabled=\{!formReady \|\| submitting\}/)
assert.match(formSource, /Complete every required field before creating the payer link/)
assert.match(formSource, /You create the terms\. The payer funds the agreement and approves each release\./)
assert.match(formSource, /The signed-in payer who starts the agreement controls its funding, approvals, cancellation, and refund\./)
const payerPageSource = readFileSync(new URL('../src/pages/ArcAgreementPayerPage.tsx', import.meta.url), 'utf8')
assert.match(payerPageSource, /Agreement completed/)
assert.match(payerPageSource, /All protected USDC has been released on Arc/)
assert.doesNotMatch(formSource, /['"]x-api-key['"]/i)
const dashboardSource = readFileSync(new URL('../modules/streampay/src/components/agreements/AgreementDashboard.tsx', import.meta.url), 'utf8')
assert.match(dashboardSource, /action:\s*'rotate_payer_link'/)
assert.match(dashboardSource, /action:\s*'request_release'/)
assert.match(dashboardSource, /Active protected/)
assert.match(dashboardSource, /Refund available/)
assert.match(dashboardSource, /delivery\.issue_reported/)
assert.match(dashboardSource, /agreement\.amount \|\| '0'/)
assert.match(dashboardSource, /View Arc proof/)
assert.doesNotMatch(dashboardSource, /['"]x-api-key['"]/i)

console.log('Hash PayStream Arc Agreements dashboard smoke checks passed.')

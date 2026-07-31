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
let authorizedProject = ''

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
  activationStatus: 'contract_unavailable',
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
    return { id, name: 'Hash PayStream Arc Pilot', capabilities: ['arc_agreements'] }
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
    assert.equal(req.body.template, 'fixed_unlock')
    assert.match(req.body.externalId, /^hps-[a-f0-9]{20}$/)
    assert.match(req.body.resourceId, /^agreement:[a-f0-9]{20}$/)
    assert.equal(req.body.title, 'New protected payment')
    assert.equal(req.body.amount, '0.1')
    assert.equal(req.originalBody.externalId, 'must-not-pass-through')
    assert.notEqual(req.body.externalId, req.originalBody.externalId)
    return res.status(201).json({
      ok: true,
      agreement: { id: 'agr_createdagreement1234', title: req.body.title, amount: req.body.amount, recipient: req.body.recipient },
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
    template: 'milestone',
  },
})
assert.equal(created.statusCode, 201)
assert.equal(created.body.agreement.title, 'New protected payment')

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
  authorize: async () => ({ id: projectId, name: 'Project', capabilities: ['hosted_checkout'] }),
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
assert.doesNotMatch(formSource, /['"]x-api-key['"]/i)
const dashboardSource = readFileSync(new URL('../modules/streampay/src/components/agreements/AgreementDashboard.tsx', import.meta.url), 'utf8')
assert.match(dashboardSource, /action:\s*'rotate_payer_link'/)
assert.match(dashboardSource, /agreement\.amount \|\| '0'/)
assert.doesNotMatch(dashboardSource, /['"]x-api-key['"]/i)

console.log('Hash PayStream Arc Agreements dashboard smoke checks passed.')

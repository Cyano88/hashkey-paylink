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
  env: () => ({ HASHPAYSTREAM_ARC_PROJECT_ID: projectId }),
}

async function call(handler, method = 'GET') {
  const response = responseRecorder()
  await handler({ method, headers: { authorization: 'Bearer test' } }, response)
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

const methodResponse = await call(createHashPayStreamArcAgreementsHandler(dependencies), 'POST')
assert.equal(methodResponse.statusCode, 405)
assert.equal(methodResponse.headers.allow, 'GET')

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
const appSource = readFileSync(new URL('../modules/streampay/src/StreamPayApp.tsx', import.meta.url), 'utf8')
assert.match(appSource, /<Route index element={<AgreementDashboard\s*\/>}/)

console.log('Hash PayStream Arc Agreements dashboard smoke checks passed.')

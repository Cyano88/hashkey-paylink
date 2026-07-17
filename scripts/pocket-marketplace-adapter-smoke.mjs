import assert from 'node:assert/strict'
import { createPocketMarketplaceHandler } from '../api/pocket/marketplace.ts'

const resource = 'https://service.example/ready'
const gatewayAccept = {
  scheme: 'exact',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amount: '8000',
  extra: { name: 'GatewayWalletBatched', version: '1' },
}

function discovered(items) {
  return { data: { items, pagination: { total: items.length } } }
}

function item(overrides = {}) {
  return {
    resource,
    type: 'http',
    accepts: [gatewayAccept],
    metadata: {
      method: 'GET',
      description: 'Trending market data',
      supportsCircleGateway: true,
      outputSchema: { input: { queryParams: { type: 'object', properties: {} } } },
      provider: { name: 'Verified provider', category: 'FINANCIAL_ANALYSIS' },
    },
    ...overrides,
  }
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

const action = {
  id: 'action-1',
  ownerId: 'did:privy:user',
  idempotencyKey: 'pocket:marketplace:1234567890',
  action: 'marketplace.service.purchase',
  status: 'started',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

let paid = 0
let payInput
let estimateError
let payError
let actions = []
const recorded = []
const handler = createPocketMarketplaceHandler({
  verifyUser: async () => ({ userId: 'did:privy:user', email: 'pocket@example.com' }),
  search: async ({ query }) => discovered(query ? [item()] : [
    item(),
    item({ resource: 'https://service.example/unknown-inputs', metadata: { ...item().metadata, outputSchema: undefined } }),
    item({ resource: 'https://service.example/{required}' }),
    item({ resource: 'https://service.example/form', metadata: { ...item().metadata, input: { queryParams: { required: ['city'] } } } }),
    item({ resource: 'https://service.example/ticker', metadata: { ...item().metadata, outputSchema: { input: { queryParams: { type: 'object', required: ['ticker'], properties: { ticker: { type: 'string' } } } } } } }),
    item({ resource: 'https://service.example/plain', metadata: { ...item().metadata, supportsCircleGateway: false } }),
  ]),
  inspect: async () => ({ data: {
    status: 'payable',
    method: 'GET',
    scheme: 'GatewayWalletBatched',
    chains: ['eip155:8453'],
    description: 'Trending market data',
    provider: { name: 'Verified provider' },
    price: { amount: '8000', formatted: '$0.008 USDC' },
  } }),
  estimate: async () => {
    if (estimateError) throw estimateError
    return 'Estimated payment: 0.008 USDC'
  },
  pay: async input => {
    paid += 1
    payInput = input
    if (payError) throw payError
    return {
      walletAddress: '0x0000000000000000000000000000000000000001',
      response: { data: [{ id: 'bitcoin' }] },
      receiptActivityId: 'receipt-1',
      proof: { proofHash: 'proof', transaction: '0xtx' },
      raw: 'not exposed',
    }
  },
  listActivity: async () => [],
  listActions: async () => actions,
  claim: async () => ({ record: action, claimed: true }),
  record: async input => {
    recorded.push(input)
    return { ...action, ...input, updatedAt: Date.now() }
  },
})

const getRes = response()
await handler({ method: 'GET', query: {}, headers: {} }, getRes)
assert.equal(getRes.statusCode, 200)
assert.equal(getRes.body.ok, true)
assert.equal(getRes.body.services.length, 1)
assert.equal(getRes.body.services[0].resource, resource)
assert.equal(getRes.body.services[0].amount, '0.008')
assert.equal(getRes.body.arcMarketplaceSupported, false)
assert.match(getRes.headers['x-request-id'], /^[0-9a-f-]{36}$/)

const postRes = response()
await handler({
  method: 'POST',
  query: {},
  headers: { 'idempotency-key': action.idempotencyKey },
  body: { resource, maxAmount: '0.008' },
}, postRes)
assert.equal(postRes.statusCode, 200)
assert.equal(postRes.body.ok, true)
assert.equal(postRes.body.receiptActivityId, 'receipt-1')
assert.deepEqual(postRes.body.result, { data: [{ id: 'bitcoin' }] })
assert.equal(paid, 1)
assert.equal(payInput.paymentChain, 'BASE')
assert.equal(payInput.maxAmount, 0.008)
assert.equal(payInput.appendResultActivity, false)

estimateError = Object.assign(new Error('Server response: Please provide a valid ticker or CIK'), { code: 1 })
const rejectedEstimateRes = response()
await handler({
  method: 'POST',
  query: {},
  headers: { 'idempotency-key': 'pocket:marketplace:estimatefail' },
  body: { resource, maxAmount: '0.008' },
}, rejectedEstimateRes)
assert.equal(rejectedEstimateRes.statusCode, 409)
assert.equal(rejectedEstimateRes.body.error.code, 'VERSION_CONFLICT')
assert.match(rejectedEstimateRes.body.error.message, /No payment was submitted/)
assert.equal(paid, 1)
estimateError = undefined

payError = Object.assign(new Error('PAYMENT WAS SUBMITTED - funds may have moved'), {
  status: 409,
  code: 'circle_payment_submitted_response_failed',
  receiptActivityId: 'receipt-pending',
})
const submittedRes = response()
await handler({
  method: 'POST',
  query: {},
  headers: { 'idempotency-key': 'pocket:marketplace:submitted1' },
  body: { resource, maxAmount: '0.008' },
}, submittedRes)
assert.equal(submittedRes.statusCode, 202)
assert.equal(submittedRes.body.status, 'processing')
assert.equal(submittedRes.body.receiptActivityId, 'receipt-pending')
assert.equal(recorded.at(-1).status, 'submitted')
assert.equal(paid, 2)
payError = undefined

actions = [{
  ...action,
  id: 'submitted-action',
  idempotencyKey: 'pocket:marketplace:submitted1',
  status: 'submitted',
  resourceId: 'receipt-pending',
  metadata: { resource },
  updatedAt: Date.now(),
}]
const duplicateSubmittedRes = response()
await handler({
  method: 'POST',
  query: {},
  headers: { 'idempotency-key': 'pocket:marketplace:newattempt1' },
  body: { resource, maxAmount: '0.008' },
}, duplicateSubmittedRes)
assert.equal(duplicateSubmittedRes.statusCode, 202)
assert.equal(duplicateSubmittedRes.body.replayed, true)
assert.equal(duplicateSubmittedRes.body.receiptActivityId, 'receipt-pending')
assert.equal(paid, 2)
actions = []

const overCapRes = response()
await handler({
  method: 'POST',
  query: {},
  headers: { 'idempotency-key': 'pocket:marketplace:abcdefghij' },
  body: { resource, maxAmount: '0.5' },
}, overCapRes)
assert.equal(overCapRes.statusCode, 400)
assert.equal(paid, 2)

console.log('pocket marketplace adapter smoke passed')

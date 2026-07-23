import assert from 'node:assert/strict'
import { createAgenticCheckoutWalletPayHandler } from '../api/agentic-checkout-wallet-pay.ts'

const checkoutId = 'chk_agentwalletpay1234'
const paymentAttemptId = 'pat_agentwalletpay123456'
const idempotencyKey = 'agentic-checkout:test-request-0001'

function checkout(overrides = {}) {
  return {
    id: checkoutId,
    partnerId: 'dev_polydesk',
    kind: 'service',
    merchantName: 'PolyDesk',
    title: 'Polymarket LP Scout',
    description: 'Verified research.',
    amount: '0.01',
    flexible: false,
    network: 'arc',
    recipient: '0x1111111111111111111111111111111111111111',
    memo: 'LP Scout',
    returnUrl: 'https://polydesk.trade/complete',
    createdAt: '2026-07-23T18:00:00.000Z',
    expiresAt: '2026-07-23T22:00:00.000Z',
    requestHash: 'a'.repeat(64),
    checkoutMode: 'agentic',
    agenticType: 'agent_treasury',
    paymentAttempts: [{
      id: paymentAttemptId,
      mode: 'agentic',
      status: 'pending',
      network: 'arc',
      recipient: '0x1111111111111111111111111111111111111111',
      returnUrl: 'https://polydesk.trade/complete',
      amount: '0.01',
      createdAt: '2026-07-23T18:00:00.000Z',
      updatedAt: '2026-07-23T18:00:00.000Z',
    }],
    integrity: 'b'.repeat(64),
    ...overrides,
  }
}

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

async function request(handler, {
  method = 'POST',
  body = { checkoutId, paymentAttemptId },
  key = idempotencyKey,
} = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers: { 'idempotency-key': key } }, res)
  return res
}

let active = checkout()
const payCalls = []
const records = []
const handler = createAgenticCheckoutWalletPayHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'payer@example.com' }),
  read: async () => active,
  readSnapshot: async ({ network }) => ({
    found: true,
    connected: true,
    network,
    walletAddress: '0x2222222222222222222222222222222222222222',
    walletBalance: '1',
    walletBalanceChecked: true,
    gatewayBalance: '0.5',
    gatewayBalanceChecked: true,
  }),
  pay: async input => {
    payCalls.push(input)
    active = checkout({
      payment: {
        status: 'paid',
        referenceType: 'circle_gateway_transfer',
        txHash: '3c90c3cc-0d44-4b50-8888-8dd25736052a',
        payer: '0x2222222222222222222222222222222222222222',
        amount: '0.01',
        confirmedAt: '2026-07-23T19:00:00.000Z',
        network: 'arc',
      },
    })
    return { walletAddress: '0x2222222222222222222222222222222222222222', receiptActivityId: 'receipt-1', proof: {}, response: {} }
  },
  claim: async input => ({
    claimed: true,
    record: {
      id: 'action-1',
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: 'started',
      metadata: input.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  }),
  record: async input => {
    records.push(input)
    return {
      id: 'action-1',
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: input.status,
      resourceId: input.resourceId,
      metadata: input.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  },
  baseUrl: () => 'https://app.hashpaylink.com',
  now: () => new Date('2026-07-23T19:00:00.000Z'),
})

assert.equal((await request(handler, { method: 'GET' })).statusCode, 405)
assert.equal((await request(handler, { key: '' })).statusCode, 400)
assert.equal((await request(handler, { body: { checkoutId: 'bad', paymentAttemptId } })).statusCode, 400)

const paid = await request(handler)
assert.equal(paid.statusCode, 200)
assert.equal(paid.body.status, 'paid')
assert.equal(payCalls.length, 1)
assert.equal(payCalls[0].paymentChain, 'ARC-TESTNET')
assert.equal(
  payCalls[0].serviceUrl,
  `https://app.hashpaylink.com/api/v2/checkouts/agent?id=${checkoutId}&attempt=${paymentAttemptId}`,
)
assert.equal(records[0].status, 'completed')

const replay = await request(handler)
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.replayed, true)
assert.equal(payCalls.length, 1)

active = checkout()
const insufficientHandler = createAgenticCheckoutWalletPayHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'payer@example.com' }),
  read: async () => active,
  readSnapshot: async ({ network }) => ({
    found: true,
    connected: true,
    network,
    walletAddress: '0x2222222222222222222222222222222222222222',
    walletBalance: '1',
    walletBalanceChecked: true,
    gatewayBalance: '0.009999',
    gatewayBalanceChecked: true,
  }),
  pay: async () => { throw new Error('must not pay') },
  claim: async () => { throw new Error('must not claim') },
  record: async () => { throw new Error('must not record') },
  baseUrl: () => 'https://app.hashpaylink.com',
  now: () => new Date('2026-07-23T19:00:00.000Z'),
})
const insufficient = await request(insufficientHandler)
assert.equal(insufficient.statusCode, 409)
assert.equal(insufficient.body.error.code, 'INSUFFICIENT_GATEWAY_BALANCE')

const disconnectedHandler = createAgenticCheckoutWalletPayHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'payer@example.com' }),
  read: async () => active,
  readSnapshot: async ({ network }) => ({
    found: false,
    connected: false,
    network,
    walletBalanceChecked: false,
    gatewayBalanceChecked: false,
  }),
  pay: async () => { throw new Error('must not pay') },
  claim: async () => { throw new Error('must not claim') },
  record: async () => { throw new Error('must not record') },
  baseUrl: () => 'https://app.hashpaylink.com',
  now: () => new Date('2026-07-23T19:00:00.000Z'),
})
assert.equal((await request(disconnectedHandler)).body.error.code, 'WALLET_NOT_READY')

const duplicateHandler = createAgenticCheckoutWalletPayHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'payer@example.com' }),
  read: async () => active,
  readSnapshot: async ({ network }) => ({
    found: true,
    connected: true,
    network,
    walletAddress: '0x2222222222222222222222222222222222222222',
    walletBalanceChecked: true,
    gatewayBalance: '1',
    gatewayBalanceChecked: true,
  }),
  pay: async () => { throw new Error('must not pay') },
  claim: async input => ({
    claimed: false,
    record: {
      id: 'action-1',
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: 'started',
      metadata: input.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  }),
  record: async () => { throw new Error('must not record') },
  baseUrl: () => 'https://app.hashpaylink.com',
  now: () => new Date('2026-07-23T19:00:00.000Z'),
})
const duplicate = await request(duplicateHandler)
assert.equal(duplicate.statusCode, 202)
assert.equal(duplicate.body.status, 'processing')

active = checkout({ network: 'arbitrum', paymentAttempts: [{ ...checkout().paymentAttempts[0], network: 'arbitrum' }] })
const unsupported = await request(disconnectedHandler)
assert.equal(unsupported.statusCode, 409)
assert.equal(unsupported.body.error.code, 'NETWORK_UNAVAILABLE')

console.log('Authenticated agent checkout wallet payment adapter smoke tests passed.')

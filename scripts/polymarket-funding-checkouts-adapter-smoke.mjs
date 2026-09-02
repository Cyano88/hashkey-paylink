import assert from 'node:assert/strict'
import { createPolymarketFundingCheckoutsHandler } from '../api/polymarket-funding-checkouts.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, method, { body = undefined, query = {}, idempotencyKey = 'polydesk:funding:request-0001' } = {}) {
  const response = responseRecorder()
  await handler({ method, body, query, headers: { 'x-api-key': 'hpl_live_test', 'idempotency-key': idempotencyKey } }, response)
  return response
}

const targetWallet = '0x2222222222222222222222222222222222222222'
const depositAddress = '0x3333333333333333333333333333333333333333'
const secret = 'hosted-checkout-test-secret-longer-than-thirty-two-characters'
let store
let checkoutPaid = false
let bridgeComplete = false
let capturedRouting
const basePolicy = {
  partnerId: 'dev_testproject1234', merchantName: 'PolyDesk', allowedOrigins: ['https://polydesk.trade'],
  defaultNetwork: 'base', paymentOptions: [
    { network: 'base', recipient: '0x1111111111111111111111111111111111111111' },
    { network: 'arbitrum', recipient: '0x1111111111111111111111111111111111111111' },
  ],
  settlementMode: 'usdc', capabilities: ['hosted_checkout', 'polymarket_funding'], projectManaged: true,
}
const handler = createPolymarketFundingCheckoutsHandler({
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => { store = update(store); return store },
  policy: async () => basePolicy,
  createDeposit: async wallet => {
    assert.equal(wallet, targetWallet)
    return { addressType: 'evm', depositAddress, note: '' }
  },
  bridgeStatus: async () => ({
    transactions: bridgeComplete ? [{ status: 'COMPLETED', txHash: '0xbridge', createdTimeMs: Date.parse('2026-07-22T12:03:00.000Z') }] : [],
    latest: null,
  }),
  createCheckout: async (_req, res, routing) => {
    capturedRouting = routing
    return res.status(201).json({
      ok: true, checkoutId: 'chk_polymarkettest01', paymentAttemptId: 'pat_111111111111111111111111',
      checkoutUrl: '/pay/c/chk_polymarkettest01?attempt=pat_111111111111111111111111',
      expiresAt: '2026-07-22T13:00:00.000Z',
    })
  },
  readCheckout: async () => ({
    id: 'chk_polymarkettest01', partnerId: basePolicy.partnerId, kind: 'service', merchantName: 'PolyDesk',
    title: 'Fund Polymarket account', description: '', amount: '10', flexible: false, network: 'base',
    recipient: depositAddress, paymentOptions: capturedRouting?.paymentOptions, memo: 'Polymarket funding',
    returnUrl: 'https://polydesk.trade/funding/complete', createdAt: '2026-07-22T12:00:00.000Z',
    expiresAt: '2026-07-22T13:00:00.000Z', requestHash: 'test', checkoutMode: 'human', integrity: '0'.repeat(64),
    paymentAttempts: [{
      id: 'pat_111111111111111111111111', mode: 'human', status: checkoutPaid ? 'paid' : 'pending',
      network: 'base', recipient: depositAddress, returnUrl: 'https://polydesk.trade/funding/complete', amount: '10',
      createdAt: '2026-07-22T12:00:00.000Z', updatedAt: '2026-07-22T12:01:00.000Z',
      ...(checkoutPaid ? { transaction: `0x${'a'.repeat(64)}`, receiptUrl: '/receipt/r1.test.signature' } : {}),
    }],
    ...(checkoutPaid ? { payment: { status: 'paid', txHash: `0x${'a'.repeat(64)}`, payer: '0x4444444444444444444444444444444444444444', amount: '10', confirmedAt: '2026-07-22T12:01:00.000Z', network: 'base' } } : {}),
  }),
  signingSecret: () => secret,
  now: () => new Date('2026-07-22T12:02:00.000Z'),
})

const created = await request(handler, 'POST', { body: {
  polymarketWallet: targetWallet, amount: '10', networks: ['base', 'arbitrum'],
  returnUrl: 'https://polydesk.trade/funding/complete',
} })
assert.equal(created.statusCode, 201)
assert.equal(created.body.funding.provider, 'polymarket')
assert.deepEqual(created.body.funding.availableNetworks, ['base', 'arbitrum'])
assert.deepEqual(capturedRouting.paymentOptions, [
  { network: 'base', recipient: depositAddress },
  { network: 'arbitrum', recipient: depositAddress },
])
assert.equal(capturedRouting.funding.targetWallet, targetWallet)
assert.equal(new URL(capturedRouting.funding ? store.records[created.body.fundingRequestId].returnUrl : '').searchParams.get('fundingRequestId'), created.body.fundingRequestId)

const replay = await request(handler, 'POST', { body: {
  polymarketWallet: targetWallet, amount: '10', networks: ['base', 'arbitrum'],
  returnUrl: 'https://polydesk.trade/funding/complete',
} })
assert.equal(replay.statusCode, 200)
assert.equal(replay.body.replayed, true)
assert.equal(replay.body.checkoutId, created.body.checkoutId)

const conflict = await request(handler, 'POST', { body: {
  polymarketWallet: targetWallet, amount: '11', networks: ['base'], returnUrl: 'https://polydesk.trade/funding/complete',
} })
assert.equal(conflict.statusCode, 409)

const pending = await request(handler, 'GET', { query: { id: created.body.fundingRequestId } })
assert.equal(pending.body.status, 'awaiting_payment')
assert.equal(pending.body.receiptUrl, undefined)

checkoutPaid = true
const bridging = await request(handler, 'GET', { query: { id: created.body.fundingRequestId } })
assert.equal(bridging.body.status, 'bridging')
assert.equal(bridging.body.receiptUrl, undefined)

bridgeComplete = true
const funded = await request(handler, 'GET', { query: { id: created.body.fundingRequestId } })
assert.equal(funded.body.status, 'funded')
assert.equal(funded.body.receiptUrl, '/receipt/r1.test.signature')
assert.equal(funded.body.returnUrl, `https://polydesk.trade/funding/complete?fundingRequestId=${created.body.fundingRequestId}`)

const forbiddenHandler = createPolymarketFundingCheckoutsHandler({
  hasStore: () => true, read: async () => undefined, mutate: async () => ({ records: {}, idempotency: {} }),
  policy: async () => ({ ...basePolicy, capabilities: ['hosted_checkout'] }), createDeposit: async () => { throw new Error('must not call provider') },
  bridgeStatus: async () => ({ transactions: [], latest: null }), createCheckout: async () => undefined,
  readCheckout: async () => null, signingSecret: () => secret, now: () => new Date(),
})
assert.equal((await request(forbiddenHandler, 'POST', { body: {} })).statusCode, 403)

console.log('Polymarket funding checkout adapter smoke tests passed')

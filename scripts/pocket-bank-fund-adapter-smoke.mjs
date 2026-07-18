import assert from 'node:assert/strict'
import { createPocketBankFundHandler } from '../api/pocket/bank-fund.ts'

const order = {
  intent_id: 'fund_intent_1',
  paycrest_order_id: 'fund_order_1',
  merchant_id: 'fund_link_1',
  amount_ngn: '1000.00',
  amount_usdc: '0.75',
  destination_network: 'base',
  destination_address: '0x1111111111111111111111111111111111111111',
  provider_institution: 'Test Bank',
  provider_account_identifier: '0123456789',
  provider_account_name: 'PAYCREST FUNDING',
  provider_amount_to_transfer: '1000.00',
  status: 'initiated',
  valid_until: '2026-07-18T12:00:00.000Z',
  source: 'bank-send',
}

function responseRecorder() {
  return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

async function request(handler, body, headers = {}) {
  const response = responseRecorder()
  await handler({ method: 'POST', body, headers }, response)
  return response
}

const createCalls = []
const handler = createPocketBankFundHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readLink: async () => ({ circleWalletAddress: order.destination_address }),
  createBankSend: async (_req, body) => {
    createCalls.push(body)
    return { link: { link_id: order.merchant_id } }
  },
  listHistory: async () => ({ bankSendLinks: [{ link_id: order.merchant_id }], merchants: [], payments: [] }),
  getOrder: async id => id === order.intent_id ? order : null,
  listOrders: async () => [],
  refreshOrder: async () => ({ ...order, status: 'settled' }),
  createOrder: async () => ({ status: 200, body: { ok: true, order } }),
})

const prepared = await request(handler, {
  action: 'prepare',
  amount_ngn: '1000',
  refund_bank_code: 'TESTBANK',
  refund_bank_name: 'Test Bank',
  refund_account_number: '1234567890',
  refund_account_name: 'ADA LOVELACE',
  owner_first_name: 'Ada',
  owner_last_name: 'Lovelace',
  client_origin: 'https://hashpaylink.com',
  network: 'polygon',
  destination_address: '0x2222222222222222222222222222222222222222',
}, { 'idempotency-key': 'pocket:bank-fund:test-request-0001' })
assert.equal(prepared.statusCode, 200)
assert.equal(prepared.body.data.destinationNetwork, 'base')
assert.equal(prepared.body.data.state, 'waiting')
assert.equal(prepared.body.data.accountNumber, '0123456789')
assert.equal(createCalls[0].network, 'base')
assert.equal(createCalls[0].destination_address, order.destination_address)

const settled = await request(handler, { action: 'status', intent_id: order.intent_id })
assert.equal(settled.statusCode, 200)
assert.equal(settled.body.data.state, 'funded')

const noWallet = createPocketBankFundHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readLink: async () => null,
})
const missingWallet = await request(noWallet, {
  action: 'prepare', amount_ngn: '1000', refund_bank_code: 'TEST', refund_bank_name: 'Test', refund_account_number: '1234567890', refund_account_name: 'ADA',
}, { 'idempotency-key': 'pocket:bank-fund:test-request-0002' })
assert.equal(missingWallet.statusCode, 400)

console.log('Circle Pocket bank-fund adapter smoke tests passed.')

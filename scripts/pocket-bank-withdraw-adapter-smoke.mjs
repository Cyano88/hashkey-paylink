import assert from 'node:assert/strict'
import { createPocketBankWithdrawHandler, payoutState } from '../api/pocket/bank-withdraw.ts'
import { confirmPocketBankWithdraw, preparePocketBankWithdraw, readPocketBankWithdrawStatus } from '../src/pocket/api/pocketBankWithdrawClient.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, body, headers = {}) {
  const response = responseRecorder()
  await handler({ method: 'POST', body, headers }, response)
  return response
}

const processingOrder = {
  intent_id: 'intent_direct_001',
  paycrest_order_id: 'order_direct_001',
  merchant_id: 'merchant_direct_001',
  amount_ngn: '1600.00',
  amount_usdc: '1',
  receive_address: '0x1111111111111111111111111111111111111111',
  status: 'pending',
  bank_name: 'Test Bank',
  bank_last4: '6789',
  bank_account_name: 'ADA LOVELACE',
}
const settledOrder = { ...processingOrder, status: 'settled', tx_hash: `0x${'2'.repeat(64)}` }
const calls = []
const handler = createPocketBankWithdrawHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  createBankReceive: async req => {
    calls.push({ kind: 'create', body: req.body, headers: req.headers })
    return { ok: true, link: { intent_id: processingOrder.intent_id, merchant_id: processingOrder.merchant_id } }
  },
  listHistory: async () => ({ merchants: [{ merchant_id: processingOrder.merchant_id }], orders: [], bankSendLinks: [], bankSendOrders: [] }),
  invokeLegacy: async (_req, body) => {
    calls.push({ kind: 'legacy', body })
    if (body.action === 'offrampStatus') return { status: 200, body: { ok: true, order: body.refresh ? settledOrder : processingOrder } }
    return { status: 200, body: { ok: true, order: processingOrder } }
  },
})

const prepareBody = {
  action: 'prepare',
  owner_email: 'ada@example.com',
  owner_first_name: 'Ada',
  owner_last_name: 'Lovelace',
  bank_code: '001',
  bank_name: 'Test Bank',
  account_number: '0123456789',
  account_name: 'ADA LOVELACE',
  amount_ngn: '1600',
  wallet_address: '0x2222222222222222222222222222222222222222',
}
const idempotencyKey = 'pocket:bank-withdraw:test-request-0001'
const prepared = await request(handler, prepareBody, { authorization: 'Bearer privy-token', 'idempotency-key': idempotencyKey })
assert.equal(prepared.statusCode, 200)
assert.equal(prepared.body.data.state, 'processing')
assert.equal(prepared.body.data.amountUsdc, '1')
assert.equal(calls[0].body.direct_payout, true)
assert.equal(calls[0].body.flexible_amount, false)
assert.equal(calls[0].headers.authorization, 'Bearer privy-token')
assert.equal(calls[1].body.action, 'createOfframpOrder')

const confirmed = await request(handler, {
  action: 'confirm',
  intent_id: processingOrder.intent_id,
  order_id: processingOrder.paycrest_order_id,
  tx_hash: `0x${'2'.repeat(64)}`,
  wallet_address: prepareBody.wallet_address,
})
assert.equal(confirmed.statusCode, 200)
assert.equal(confirmed.body.data.state, 'processing')
assert.equal(calls.at(-1).body.action, 'markOfframpPaid')

const status = await request(handler, { action: 'status', intent_id: processingOrder.intent_id })
assert.equal(status.statusCode, 200)
assert.equal(status.body.data.state, 'sent')
assert.equal(payoutState('validated'), 'sent')
assert.equal(payoutState('deposited'), 'processing')
assert.equal(payoutState('refunded'), 'refunded')

const forbidden = createPocketBankWithdrawHandler({
  verifyUser: async () => ({ userId: 'other-user', email: 'other@example.com' }),
  listHistory: async () => ({ merchants: [], orders: [], bankSendLinks: [], bankSendOrders: [] }),
  invokeLegacy: async () => ({ status: 200, body: { order: processingOrder } }),
})
const denied = await request(forbidden, { action: 'status', intent_id: processingOrder.intent_id })
assert.equal(denied.statusCode, 403)

const clientCalls = []
const fetcher = async (url, init) => {
  clientCalls.push({ url, init })
  return { ok: true, json: async () => ({ ok: true, data: prepared.body.data }) }
}
await preparePocketBankWithdraw({ accessToken: 'privy-token', request: prepareBody, idempotencyKey, fetcher })
await confirmPocketBankWithdraw({ accessToken: 'privy-token', request: { intent_id: processingOrder.intent_id }, fetcher })
await readPocketBankWithdrawStatus({ accessToken: 'privy-token', intentId: processingOrder.intent_id, fetcher })
assert.equal(clientCalls[0].url, '/api/pocket/bank-withdraw')
assert.equal(clientCalls[0].init.headers.authorization, 'Bearer privy-token')
assert.equal(clientCalls[0].init.headers['idempotency-key'], idempotencyKey)
assert.equal(JSON.parse(clientCalls[0].init.body).action, 'prepare')
assert.equal(JSON.parse(clientCalls[1].init.body).action, 'confirm')
assert.equal(JSON.parse(clientCalls[2].init.body).action, 'status')

console.log('Circle Pocket direct bank-withdraw adapter smoke tests passed.')

import assert from 'node:assert/strict'
import { createPocketBankWithdrawHandler, payoutState } from '../api/pocket/bank-withdraw.ts'
import { createPaymentExecutionRepository } from '../api/pocket/payment-execution-intents.ts'
import { authorizePocketBankWithdraw, confirmPocketBankWithdraw, preparePocketBankWithdraw, readPocketBankWithdrawRoute, readPocketBankWithdrawStatus, recoverPocketBankWithdrawals, registerPocketBankWithdrawTransfer, startPocketBankWithdrawRoute, updatePocketBankWithdrawRoute } from '../src/pocket/api/pocketBankWithdrawClient.ts'
import { clearActivePocketBankPayout, readActivePocketBankPayout, readActivePocketBankPayoutTransfer, saveActivePocketBankPayout } from '../src/pocket/lib/pocketBankPayoutState.ts'

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

let executionStore
const executions = createPaymentExecutionRepository({
  durable: true,
  isRender: false,
  readDurable: async () => executionStore,
  mutateDurable: async (_key, mutate) => {
    executionStore = await mutate(executionStore)
    return executionStore
  },
  createId: () => 'pex_bank_withdraw_test',
})

const processingOrder = {
  intent_id: 'intent_direct_001',
  paycrest_order_id: 'order_direct_001',
  merchant_id: 'merchant_direct_001',
  amount_ngn: '1600.00',
  amount_usdc: '1',
  receive_address: '0x1111111111111111111111111111111111111111',
  status: 'initiated',
  valid_until: new Date(Date.now() + 5 * 60_000).toISOString(),
  bank_name: 'Test Bank',
  bank_last4: '6789',
  bank_account_name: 'ADA LOVELACE',
}
const settledOrder = { ...processingOrder, status: 'settled', tx_hash: `0x${'2'.repeat(64)}` }
const calls = []
let routeAction
let bridgeState = 'pending'
let refreshedOrder = processingOrder
const handler = createPocketBankWithdrawHandler({
  executions,
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  authorizeBankAccount: async () => ({ verification: { account_name: 'ADA LOVELACE' } }),
  readBridgeStatus: async () => {
    if (bridgeState === 'unavailable') throw new Error('Circle bridge status is temporarily unavailable.')
    return { status: bridgeState, destinationTxHash: bridgeState === 'confirmed' ? `0x${'4'.repeat(64)}` : undefined }
  },
  createBankReceive: async req => {
    calls.push({ kind: 'create', body: req.body, headers: req.headers })
    return { ok: true, link: { intent_id: processingOrder.intent_id, merchant_id: processingOrder.merchant_id } }
  },
  listHistory: async () => ({ merchants: [{ merchant_id: processingOrder.merchant_id }], orders: [], bankSendLinks: [], bankSendOrders: [] }),
  listActions: async () => routeAction ? [routeAction] : [],
  claimAction: async input => {
    routeAction = { id: 'route-1', ownerId: input.ownerId, idempotencyKey: input.idempotencyKey, action: input.action, status: 'started', metadata: input.metadata, createdAt: 1, updatedAt: 1 }
    return { record: routeAction, claimed: true }
  },
  recordAction: async input => {
    routeAction = { id: 'route-1', ownerId: input.ownerId, idempotencyKey: input.idempotencyKey, action: input.action, status: input.status, resourceId: input.resourceId, metadata: input.metadata, createdAt: 1, updatedAt: 2 }
    return routeAction
  },
  invokeLegacy: async (_req, body) => {
    calls.push({ kind: 'legacy', body })
    if (body.action === 'offrampStatus') return { status: 200, body: { ok: true, order: body.refresh ? refreshedOrder : processingOrder } }
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
assert.equal(prepared.body.data.executionId, 'pex_bank_withdraw_test')
assert.equal(prepared.body.data.executionState, 'authorized')
assert.equal(prepared.body.data.nextAction, 'ensure_liquidity')
assert.equal(calls[0].body.direct_payout, true)
assert.equal(calls[0].body.flexible_amount, false)
assert.equal(calls[0].headers.authorization, 'Bearer privy-token')
assert.equal(calls[1].body.action, 'createOfframpOrder')
assert.equal(calls[1].body.ensure_payable, true)

const unavailableHandler = createPocketBankWithdrawHandler({
  executions,
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  authorizeBankAccount: async () => undefined,
  createBankReceive: async () => {
    throw Object.assign(new Error('no provider available for USDC to NGN conversion with amount 1 on base'), { status: 503 })
  },
})
const unavailablePayout = await request(unavailableHandler, prepareBody, { authorization: 'Bearer privy-token', 'idempotency-key': 'pocket:bank-withdraw:test-request-0002' })
assert.equal(unavailablePayout.statusCode, 503)
assert.equal(unavailablePayout.body.error, 'This Naira amount is unavailable right now. Try another amount.')

const authorized = await request(handler, {
  action: 'authorize',
  intent_id: processingOrder.intent_id,
  wallet_address: prepareBody.wallet_address,
  payer_name: 'Ada Lovelace',
})
assert.equal(authorized.statusCode, 200)
assert.equal(authorized.body.data.orderId, processingOrder.paycrest_order_id)
assert.equal(authorized.body.data.validUntil, processingOrder.valid_until)
assert.equal(calls.at(-1).body.action, 'createOfframpOrder')
assert.equal(calls.at(-1).body.ensure_payable, true)

const unsafeWindowHandler = createPocketBankWithdrawHandler({
  executions,
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  listHistory: async () => ({ merchants: [{ merchant_id: processingOrder.merchant_id }], orders: [], bankSendLinks: [], bankSendOrders: [] }),
  invokeLegacy: async (_req, body) => ({ status: 200, body: { order: body.action === 'createOfframpOrder'
    ? { ...processingOrder, valid_until: new Date(Date.now() + 30_000).toISOString() }
    : processingOrder } }),
})
const unsafeWindow = await request(unsafeWindowHandler, {
  action: 'authorize',
  intent_id: processingOrder.intent_id,
  wallet_address: prepareBody.wallet_address,
  payer_name: 'Ada Lovelace',
})
assert.equal(unsafeWindow.statusCode, 409)
assert.match(unsafeWindow.body.error, /too close to expiry/i)

const routeMissing = await request(handler, { action: 'routeStatus', intent_id: processingOrder.intent_id })
assert.equal(routeMissing.body.data, null)
const routeZero = await request(handler, { action: 'routeStart', intent_id: processingOrder.intent_id, source: 'arbitrum', destination: 'base', amount: '0' })
assert.equal(routeZero.statusCode, 400)
const routeExcess = await request(handler, { action: 'routeStart', intent_id: processingOrder.intent_id, source: 'arbitrum', destination: 'base', amount: '1.000001' })
assert.equal(routeExcess.statusCode, 409)
const routeStarted = await request(handler, { action: 'routeStart', intent_id: processingOrder.intent_id, source: 'arbitrum', destination: 'base', amount: '0.6' })
assert.equal(routeStarted.body.data.phase, 'started')
assert.equal(routeStarted.body.data.claimed, true)
assert.equal(routeStarted.body.data.amount, '0.6')
const routeDuplicate = await request(handler, { action: 'routeStart', intent_id: processingOrder.intent_id, source: 'arbitrum', destination: 'base', amount: '0.6' })
assert.equal(routeDuplicate.body.data.claimed, false)
const routeSubmitted = await request(handler, { action: 'routeUpdate', intent_id: processingOrder.intent_id, phase: 'submitted', tx_hash: `0x${'3'.repeat(64)}` })
assert.equal(routeSubmitted.body.data.phase, 'submitted')
bridgeState = 'unavailable'
const recoverWhileCircleUnavailable = await request(handler, { action: 'recover' })
assert.equal(recoverWhileCircleUnavailable.statusCode, 200)
assert.equal(recoverWhileCircleUnavailable.body.data[0].nextAction, 'wait_bridge')
bridgeState = 'pending'
const recoverWhileMoving = await request(handler, { action: 'recover' })
assert.equal(recoverWhileMoving.body.data[0].nextAction, 'wait_bridge')
assert.equal(recoverWhileMoving.body.data[0].route.phase, 'submitted')
bridgeState = 'confirmed'
const recoverAfterArrival = await request(handler, { action: 'recover' })
assert.equal(recoverAfterArrival.body.data[0].nextAction, 'authorize_transfer')
assert.equal(recoverAfterArrival.body.data[0].route.phase, 'completed')
assert.equal(recoverAfterArrival.body.data[0].route.txHash, `0x${'3'.repeat(64)}`)
const routeCompleted = await request(handler, { action: 'routeUpdate', intent_id: processingOrder.intent_id, phase: 'completed', tx_hash: `0x${'3'.repeat(64)}` })
assert.equal(routeCompleted.body.data.phase, 'completed')
const routeBackward = await request(handler, { action: 'routeUpdate', intent_id: processingOrder.intent_id, phase: 'failed' })
assert.equal(routeBackward.statusCode, 409)
const routeRestarted = await request(handler, { action: 'routeStart', intent_id: processingOrder.intent_id, source: 'solana', destination: 'base', amount: '0.1' })
assert.equal(routeRestarted.body.data.phase, 'started')
assert.equal(routeRestarted.body.data.claimed, true)
assert.equal(routeRestarted.body.data.source, 'solana')
assert.equal(routeRestarted.body.data.amount, '0.1')
assert.equal(routeAction.metadata.previousTxHash, `0x${'3'.repeat(64)}`)

const submittedTransfer = await request(handler, {
  action: 'submit',
  intent_id: processingOrder.intent_id,
  tx_hash: `0x${'2'.repeat(64)}`,
})
assert.equal(submittedTransfer.statusCode, 200)
assert.equal(submittedTransfer.body.data.nextAction, 'provider_processing')
assert.equal(submittedTransfer.body.data.txHash, `0x${'2'.repeat(64)}`)
const duplicateSubmittedTransfer = await request(handler, {
  action: 'submit',
  intent_id: processingOrder.intent_id,
  tx_hash: `0x${'2'.repeat(64)}`,
})
assert.equal(duplicateSubmittedTransfer.statusCode, 200)
const conflictingSubmittedTransfer = await request(handler, {
  action: 'submit',
  intent_id: processingOrder.intent_id,
  tx_hash: `0x${'5'.repeat(64)}`,
})
assert.equal(conflictingSubmittedTransfer.statusCode, 409)

const confirmed = await request(handler, {
  action: 'confirm',
  intent_id: processingOrder.intent_id,
  order_id: processingOrder.paycrest_order_id,
  tx_hash: `0x${'2'.repeat(64)}`,
  wallet_address: prepareBody.wallet_address,
})
assert.equal(confirmed.statusCode, 200)
assert.equal(confirmed.body.data.state, 'processing')
assert.equal(confirmed.body.data.nextAction, 'provider_processing')
assert.equal(confirmed.body.data.txHash, `0x${'2'.repeat(64)}`)
assert.equal(calls.at(-1).body.action, 'markOfframpPaid')

refreshedOrder = settledOrder
const status = await request(handler, { action: 'status', intent_id: processingOrder.intent_id })
assert.equal(status.statusCode, 200)
assert.equal(status.body.data.state, 'sent')
assert.equal(status.body.data.nextAction, 'done')
assert.equal(payoutState('validated'), 'sent')
assert.equal(payoutState('deposited'), 'processing')
assert.equal(payoutState('refunded'), 'refunded')
assert.equal(payoutState('failed'), 'failed')
assert.equal(payoutState('expired'), 'failed')
assert.equal(payoutState('cancelled'), 'failed')

const forbidden = createPocketBankWithdrawHandler({
  executions,
  verifyUser: async () => ({ userId: 'other-user', email: 'other@example.com' }),
  listHistory: async () => ({ merchants: [], orders: [], bankSendLinks: [], bankSendOrders: [] }),
  invokeLegacy: async () => ({ status: 200, body: { order: processingOrder } }),
})
const denied = await request(forbidden, { action: 'status', intent_id: processingOrder.intent_id })
assert.equal(denied.statusCode, 403)

const clientCalls = []
const fetcher = async (url, init) => {
  clientCalls.push({ url, init })
  const action = JSON.parse(init.body).action
  const data = action === 'recover'
    ? [prepared.body.data]
    : action.startsWith('route')
    ? { intentId: processingOrder.intent_id, phase: action === 'routeStart' ? 'started' : action === 'routeUpdate' ? JSON.parse(init.body).phase : 'completed', source: 'arbitrum', destination: 'base', amount: '1', txHash: `0x${'3'.repeat(64)}`, updatedAt: 2 }
    : prepared.body.data
  return { ok: true, json: async () => ({ ok: true, data }) }
}
await preparePocketBankWithdraw({ accessToken: 'privy-token', request: prepareBody, idempotencyKey, fetcher })
await authorizePocketBankWithdraw({ accessToken: 'privy-token', request: { intent_id: processingOrder.intent_id }, fetcher })
await confirmPocketBankWithdraw({ accessToken: 'privy-token', request: { intent_id: processingOrder.intent_id }, fetcher })
await registerPocketBankWithdrawTransfer({ accessToken: 'privy-token', request: { intent_id: processingOrder.intent_id, tx_hash: `0x${'2'.repeat(64)}` }, fetcher })
await readPocketBankWithdrawStatus({ accessToken: 'privy-token', intentId: processingOrder.intent_id, fetcher })
const recoveredClient = await recoverPocketBankWithdrawals({ accessToken: 'privy-token', fetcher })
assert.equal(recoveredClient[0].nextAction, 'ensure_liquidity')
await readPocketBankWithdrawRoute({ accessToken: 'privy-token', intentId: processingOrder.intent_id, fetcher })
await startPocketBankWithdrawRoute({ accessToken: 'privy-token', intentId: processingOrder.intent_id, source: 'arbitrum', amount: '1', fetcher })
await updatePocketBankWithdrawRoute({ accessToken: 'privy-token', intentId: processingOrder.intent_id, phase: 'submitted', txHash: `0x${'3'.repeat(64)}`, fetcher })
assert.equal(clientCalls[0].url, '/api/pocket/bank-withdraw')
assert.equal(clientCalls[0].init.headers.authorization, 'Bearer privy-token')
assert.equal(clientCalls[0].init.headers['idempotency-key'], idempotencyKey)
assert.equal(JSON.parse(clientCalls[0].init.body).action, 'prepare')
assert.equal(JSON.parse(clientCalls[1].init.body).action, 'authorize')
assert.equal(JSON.parse(clientCalls[2].init.body).action, 'confirm')
assert.equal(JSON.parse(clientCalls[3].init.body).action, 'submit')
assert.equal(JSON.parse(clientCalls[4].init.body).action, 'status')
assert.equal(JSON.parse(clientCalls[5].init.body).action, 'recover')
assert.equal(JSON.parse(clientCalls[6].init.body).action, 'routeStatus')
assert.equal(JSON.parse(clientCalls[7].init.body).action, 'routeStart')
assert.equal(JSON.parse(clientCalls[8].init.body).action, 'routeUpdate')
await assert.rejects(
  preparePocketBankWithdraw({ accessToken: 'privy-token', request: prepareBody, idempotencyKey, fetcher: async () => { throw new TypeError('Failed to fetch') } }),
  /could not reach the bank payout service/i,
)

const localValues = new Map()
globalThis.window = {
  localStorage: {
    getItem: key => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, value),
    removeItem: key => localValues.delete(key),
  },
}
saveActivePocketBankPayout(processingOrder.intent_id)
assert.equal(readActivePocketBankPayout(), processingOrder.intent_id)
saveActivePocketBankPayout(processingOrder.intent_id, `0x${'2'.repeat(64)}`)
assert.equal(readActivePocketBankPayoutTransfer(processingOrder.intent_id), `0x${'2'.repeat(64)}`)
saveActivePocketBankPayout(processingOrder.intent_id)
assert.equal(readActivePocketBankPayoutTransfer(processingOrder.intent_id), `0x${'2'.repeat(64)}`, 'saving the active intent must preserve submitted transfer evidence')
clearActivePocketBankPayout(processingOrder.intent_id)
assert.equal(readActivePocketBankPayout(), '')

console.log('Circle Pocket direct bank-withdraw adapter smoke tests passed.')

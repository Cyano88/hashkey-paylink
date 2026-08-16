import assert from 'node:assert/strict'
import { runPocketReconciliation } from '../api/pocket/reconciliation-worker.ts'

const now = 2_000_000
const intents = new Map([
  ['paycrest', { id: 'paycrest', ownerId: 'owner-1', kind: 'bank_payout', state: 'processing', resourceId: 'pc-1', amount: '1', asset: 'USDC', sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'bank', metadata: {}, updatedAt: 1, createdAt: 1 }],
  ['awaiting', { id: 'awaiting', ownerId: 'owner-1', kind: 'bank_payout', state: 'authorized', resourceId: 'pc-awaiting', amount: '1', asset: 'USDC', sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'bank', metadata: {}, updatedAt: 1, createdAt: 1 }],
  ['expired-awaiting', { id: 'expired-awaiting', ownerId: 'owner-1', kind: 'bank_payout', state: 'authorized', resourceId: 'pc-expired-awaiting', amount: '1', asset: 'USDC', sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'bank', metadata: {}, updatedAt: 1, createdAt: 1 }],
  ['bill', { id: 'bill', ownerId: 'owner-1', kind: 'bill_payment', state: 'processing', resourceId: 'bill-1', amount: '1', asset: 'USDC', sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'bill', metadata: {}, updatedAt: 1, createdAt: 1 }],
  ['wallet', { id: 'wallet', ownerId: 'owner-1', kind: 'wallet_transfer', state: 'submitted', resourceId: '0xabc', amount: '1', asset: 'USDC', sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'wallet', metadata: {}, updatedAt: 1, createdAt: 1 }],
])
const updates = []
const repository = {
  async listUnresolved(limit) { return [...intents.values()].filter(item => !['completed', 'failed', 'expired'].includes(item.state)).slice(0, limit) },
  async update(input) {
    const current = intents.get(input.intentId)
    if (input.expectedState && current.state !== input.expectedState) return current
    const next = { ...current, ...input, updatedAt: now }
    intents.set(next.id, next); updates.push(input); return next
  },
}
const bridge = { id: 'bridge-1', ownerId: 'owner-1', idempotencyKey: 'bridge-key', action: 'wallet.bridge', status: 'submitted', resourceId: '0xbridge', metadata: { source: 'base', destination: 'arbitrum', amount: '2', txHash: '0xbridge' }, createdAt: 1, updatedAt: 1 }
const bankRoute = { id: 'bank-route-1', ownerId: 'owner-1', idempotencyKey: 'pocket:bank-withdraw-route:order-1', action: 'bank-withdraw.route', status: 'submitted', resourceId: '0xbankbridge', metadata: { intentId: 'order-1', source: 'arbitrum', destination: 'base', amount: '1', txHash: '0xbankbridge' }, createdAt: 1, updatedAt: 1 }
const abandonedBankRoute = { id: 'bank-route-abandoned', ownerId: 'owner-1', idempotencyKey: 'pocket:bank-withdraw-route:order-2', action: 'bank-withdraw.route', status: 'started', resourceId: 'order-2', metadata: { intentId: 'order-2', source: 'solana', destination: 'base', amount: '1', txHash: '' }, createdAt: 1, updatedAt: 1 }
const recentBankRoute = { id: 'bank-route-recent', ownerId: 'owner-1', idempotencyKey: 'pocket:bank-withdraw-route:order-3', action: 'bank-withdraw.route', status: 'started', resourceId: 'order-3', metadata: { intentId: 'order-3', source: 'arbitrum', destination: 'base', amount: '1', txHash: '' }, createdAt: now - 4 * 60_000, updatedAt: now - 4 * 60_000 }
const ledger = []
const actionUpdates = []
let billCalls = 0
const result = await runPocketReconciliation({
  executions: repository,
  reconcilePaycrest: async resourceId => resourceId === 'pc-awaiting'
    ? ({ ok: true, found: true, order: { status: 'pending', paycrest_order_id: 'provider-awaiting', valid_until: new Date(now + 60_000).toISOString() } })
    : resourceId === 'pc-expired-awaiting'
    ? ({ ok: true, found: true, order: { status: 'pending', paycrest_order_id: 'provider-expired-awaiting', valid_until: new Date(now - 1).toISOString() } })
    : ({ ok: true, found: true, order: { status: 'settled', paycrest_order_id: 'provider-1', tx_hash: `0x${'1'.repeat(64)}` } }),
  reconcileBill: async () => {
    billCalls += 1
    intents.set('bill', { ...intents.get('bill'), state: 'completed', updatedAt: now })
    return { intent: { state: 'delivered', quoteExpiresAt: now + 1 }, execution: intents.get('bill'), requeried: true }
  },
  readCheckout: async () => null,
  syncCheckout: async () => undefined,
  expireCheckout: async () => undefined,
  readPolymarketFunding: async () => ({ transactions: [], latest: null }),
  listBridges: async action => action === 'wallet.bridge' ? [bridge] : action === 'bank-withdraw.route' ? [bankRoute, abandonedBankRoute, recentBankRoute] : [],
  readBridge: async () => ({ status: 'confirmed', destinationTxHash: `0x${'2'.repeat(64)}` }),
  recordAction: async input => {
    actionUpdates.push(input)
    return { ...(input.action === 'bank-withdraw.route' ? bankRoute : bridge), ...input, updatedAt: now }
  },
  appendLedger: async event => { ledger.push(event); return event },
  sendEmail: async () => undefined,
  mutateDurable: async (_key, mutate) => mutate(undefined),
  now: () => now,
})

assert.equal(intents.get('paycrest').state, 'completed')
assert.equal(intents.get('awaiting').state, 'authorized', 'provider pending without payment evidence must remain action-required')
assert.equal(intents.get('expired-awaiting').state, 'expired', 'an unused payout window must stop blocking the next payout')
assert.equal(billCalls, 1)
assert.equal(intents.get('bill').state, 'completed')
assert.equal(intents.get('wallet').state, 'submitted', 'unsupported wallet execution must never be guessed terminal')
assert.equal(ledger.length, 1)
assert.equal(ledger[0].state, 'completed')
assert.equal(result.reconciled, 6)
assert.equal(result.errors, 0)
assert.ok(updates.some(item => item.intentId === 'paycrest' && item.expectedState === 'processing'))
assert.ok(actionUpdates.some(item => item.action === 'bank-withdraw.route' && item.status === 'completed'))
assert.ok(actionUpdates.some(item => item.action === 'bank-withdraw.route' && item.status === 'failed' && item.metadata.paymentState === 'expired'))
assert.equal(actionUpdates.some(item => item.idempotencyKey === recentBankRoute.idempotencyKey), false, 'a recent unsigned approval must remain available')
console.log('Pocket reconciliation worker smoke tests passed: provider truth advances Paycrest, VTpass and Circle bridge records without guessing wallet-transfer outcomes.')

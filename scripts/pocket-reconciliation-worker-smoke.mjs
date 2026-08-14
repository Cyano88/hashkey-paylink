import assert from 'node:assert/strict'
import { runPocketReconciliation } from '../api/pocket/reconciliation-worker.ts'

const now = 2_000_000
const intents = new Map([
  ['paycrest', { id: 'paycrest', ownerId: 'owner-1', kind: 'bank_payout', state: 'processing', resourceId: 'pc-1', amount: '1', asset: 'USDC', sourceNetwork: 'base', settlementNetwork: 'base', destinationType: 'bank', metadata: {}, updatedAt: 1, createdAt: 1 }],
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
const ledger = []
let billCalls = 0
const result = await runPocketReconciliation({
  executions: repository,
  reconcilePaycrest: async () => ({ ok: true, found: true, order: { status: 'settled', paycrest_order_id: 'provider-1', tx_hash: `0x${'1'.repeat(64)}` } }),
  reconcileBill: async () => {
    billCalls += 1
    intents.set('bill', { ...intents.get('bill'), state: 'completed', updatedAt: now })
    return { intent: { state: 'delivered', quoteExpiresAt: now + 1 }, execution: intents.get('bill'), requeried: true }
  },
  readCheckout: async () => null,
  syncCheckout: async () => undefined,
  expireCheckout: async () => undefined,
  readPolymarketFunding: async () => ({ transactions: [], latest: null }),
  listBridges: async () => [bridge],
  readBridge: async () => ({ status: 'confirmed', destinationTxHash: `0x${'2'.repeat(64)}` }),
  recordAction: async input => ({ ...bridge, ...input, updatedAt: now }),
  appendLedger: async event => { ledger.push(event); return event },
  sendEmail: async () => undefined,
  mutateDurable: async (_key, mutate) => mutate(undefined),
  now: () => now,
})

assert.equal(intents.get('paycrest').state, 'completed')
assert.equal(billCalls, 1)
assert.equal(intents.get('bill').state, 'completed')
assert.equal(intents.get('wallet').state, 'submitted', 'unsupported wallet execution must never be guessed terminal')
assert.equal(ledger.length, 1)
assert.equal(ledger[0].state, 'completed')
assert.equal(result.reconciled, 3)
assert.equal(result.errors, 0)
assert.ok(updates.some(item => item.intentId === 'paycrest' && item.expectedState === 'processing'))
console.log('Pocket reconciliation worker smoke tests passed: provider truth advances Paycrest, VTpass and Circle bridge records without guessing wallet-transfer outcomes.')

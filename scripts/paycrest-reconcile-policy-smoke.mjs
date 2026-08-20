import assert from 'node:assert/strict'
import {
  isNonRetryablePaycrestReconciliationError,
  isTerminalPaycrestReconciliationStatus,
  paycrestTransferRecoveryWindow,
} from '../api/paycrest-reconcile.ts'

for (const status of ['settled', 'refunded', 'failed', 'expired', 'cancelled', 'canceled']) {
  assert.equal(isTerminalPaycrestReconciliationStatus(status), true)
}
for (const status of ['pending', 'deposited', 'validated', 'settling', 'refunding']) {
  assert.equal(isTerminalPaycrestReconciliationStatus(status), false)
}

for (const message of [
  'RPC HTTP 400 for eth_blockNumber',
  'RPC HTTP 401 for eth_getLogs',
  'RPC HTTP 403 for eth_getLogs',
  'PRIVATE_RPC_URL is not configured for base.',
  'Invalid USDC recipient.',
]) {
  assert.equal(isNonRetryablePaycrestReconciliationError(new Error(message)), true)
}
for (const message of [
  'RPC HTTP 408 for eth_getLogs',
  'RPC HTTP 425 for eth_getLogs',
  'RPC HTTP 429 for eth_getLogs',
  'RPC HTTP 500 for eth_getLogs',
  'fetch failed',
]) {
  assert.equal(isNonRetryablePaycrestReconciliationError(new Error(message)), false)
}

assert.deepEqual(paycrestTransferRecoveryWindow({
  payer_wallet: '0xdccad7c3e7f15db13e1aaba4b4e80832d9d3e0e4',
  created_at: '2026-08-18T10:00:00.000Z',
  valid_until: '2026-08-18T11:00:00.000Z',
}), {
  payer: '0xdccad7c3e7f15db13e1aaba4b4e80832d9d3e0e4',
  notBefore: '2026-08-18T10:00:00.000Z',
  notAfter: '2026-08-18T11:00:00.000Z',
})
assert.deepEqual(paycrestTransferRecoveryWindow({
  payer_wallet: 'not-an-address',
  created_at: 'invalid',
  valid_until: 'invalid',
}), {})

console.log('Paycrest reconciliation policy smoke checks passed.')

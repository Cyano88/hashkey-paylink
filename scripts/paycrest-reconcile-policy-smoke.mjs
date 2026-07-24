import assert from 'node:assert/strict'
import {
  isNonRetryablePaycrestReconciliationError,
  isTerminalPaycrestReconciliationStatus,
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

console.log('Paycrest reconciliation policy smoke checks passed.')

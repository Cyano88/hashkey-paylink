import assert from 'node:assert/strict'
import { createPaymentExecutionRepository } from '../api/pocket/payment-execution-intents.ts'
import { preparePosSettlementExecution, syncPosSettlementExecution, syncPosSettlementExecutionByResource } from '../api/pocket/pos-payment-executions.ts'

function memoryStorage() {
  let value
  return {
    async read() { return value === undefined ? undefined : structuredClone(value) },
    async mutate(_key, fn) {
      value = structuredClone(await fn(value === undefined ? undefined : structuredClone(value)))
      return structuredClone(value)
    },
  }
}

const storage = memoryStorage()
let sequence = 0
const repository = createPaymentExecutionRepository({ durable: true, mutateDurable: storage.mutate, readDurable: storage.read, createId: () => `pex_pos_${++sequence}` })
const ownerId = 'did:privy:merchant-owner'
const baseOrder = {
  intent_id: 'pos-intent-1', paycrest_order_id: 'paycrest-order-1', merchant_id: 'merchant-1',
  amount_ngn: '1600.00', amount_usdc: '1', receive_address: '0x1111111111111111111111111111111111111111',
  refund_address: '0x2222222222222222222222222222222222222222', source: 'ngpos', tx_hash: '', status: 'initiated',
  created_at: '2026-08-12T12:00:00.000Z', updated_at: '2026-08-12T12:00:00.000Z',
}

const prepared = await preparePosSettlementExecution({ ownerId, merchantId: 'merchant-1', intentId: 'pos-intent-1', amountUsdc: '1' }, repository)
assert.equal(prepared.state, 'prepared')
assert.equal(prepared.resourceId, 'pos-intent-1')
const replay = await preparePosSettlementExecution({ ownerId, merchantId: 'merchant-1', intentId: 'pos-intent-1', amountUsdc: '1' }, repository)
assert.equal(replay.id, prepared.id)

const authorized = await syncPosSettlementExecution({ ownerId, order: baseOrder }, repository)
assert.equal(authorized.state, 'authorized')
assert.equal(authorized.providerReference, 'paycrest-order-1')
const processing = await syncPosSettlementExecution({ ownerId, order: { ...baseOrder, status: 'deposited', tx_hash: `0x${'a'.repeat(64)}` } }, repository)
assert.equal(processing.state, 'processing')
assert.equal(processing.transactionHash, `0x${'a'.repeat(64)}`)
const completed = await syncPosSettlementExecutionByResource({ ...baseOrder, status: 'settled', tx_hash: `0x${'a'.repeat(64)}` }, repository)
assert.equal(completed.state, 'completed')

const isolated = await preparePosSettlementExecution({ ownerId, merchantId: 'merchant-1', intentId: 'bank-intent-1', amountUsdc: '2' }, repository)
const skipped = await syncPosSettlementExecution({ ownerId, order: { ...baseOrder, intent_id: 'bank-intent-1', source: 'bank-receive' } }, repository)
assert.equal(skipped, undefined)
assert.equal((await repository.get(ownerId, isolated.id)).state, 'prepared')

const refundable = await preparePosSettlementExecution({ ownerId, merchantId: 'merchant-1', intentId: 'pos-intent-refund', amountUsdc: '3' }, repository)
const refunded = await syncPosSettlementExecution({ ownerId, order: { ...baseOrder, intent_id: 'pos-intent-refund', paycrest_order_id: 'paycrest-refund', status: 'refunded' } }, repository)
assert.equal(refunded.id, refundable.id)
assert.equal(refunded.state, 'failed')
assert.equal(refunded.failureCode, 'PROVIDER_REFUNDED')

console.log('Pocket POS payment execution smoke tests passed.')

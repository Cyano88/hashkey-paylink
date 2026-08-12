import type { PaycrestOrderRecord } from '../paycrest-pos.js'
import { paymentExecutionRepository, type PaymentExecutionIntent, type PaymentExecutionRepository } from './payment-execution-intents.js'

type PrepareInput = {
  ownerId: string
  merchantId: string
  intentId: string
  amountUsdc: string
}

function normalizedStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export async function preparePosSettlementExecution(input: PrepareInput, repository: PaymentExecutionRepository = paymentExecutionRepository) {
  const created = await repository.create({
    ownerId: input.ownerId,
    idempotencyKey: `pocket:pos-settlement:${input.intentId}`,
    kind: 'pos_settlement',
    amount: input.amountUsdc,
    sourceNetwork: 'base',
    settlementNetwork: 'base',
    destinationType: 'verified_merchant_bank_account',
    metadata: { merchantId: input.merchantId },
  })
  if (created.intent.resourceId) return created.intent
  return repository.update({
    ownerId: input.ownerId,
    intentId: created.intent.id,
    resourceId: input.intentId,
  })
}

export async function syncPosSettlementExecution(input: {
  ownerId: string
  order: PaycrestOrderRecord
}, repository: PaymentExecutionRepository = paymentExecutionRepository) {
  if (input.order.source !== 'ngpos') return undefined
  let execution = await repository.findByResource(input.ownerId, input.order.intent_id, 'pos_settlement')
  if (!execution) return undefined

  const status = normalizedStatus(input.order.status)
  const reference = {
    providerReference: input.order.paycrest_order_id,
    transactionHash: input.order.tx_hash,
    metadata: { providerStatus: status, providerAmountUsdc: input.order.amount_usdc },
  }
  const update = async (state: PaymentExecutionIntent['state'], failureCode?: string) => {
    execution = await repository.update({ ownerId: input.ownerId, intentId: execution!.id, state, failureCode, ...reference })
  }

  if (execution.state === 'prepared') await update('authorized')
  if (input.order.tx_hash && execution.state === 'authorized') await update('submitted')

  if (status === 'settled' || status === 'validated') {
    if (execution.state === 'authorized') await update('submitted')
    if (execution.state === 'submitted' || execution.state === 'processing' || execution.state === 'needs_review') await update('completed')
  } else if (status === 'refunded') {
    if (!['completed', 'failed', 'expired'].includes(execution.state)) await update('failed', 'PROVIDER_REFUNDED')
  } else if (status === 'expired' && (execution.state === 'prepared' || execution.state === 'authorized')) {
    await update('expired', 'PROVIDER_ORDER_EXPIRED')
  } else if (['failed', 'cancelled', 'canceled', 'expired'].includes(status)) {
    if (!['completed', 'failed', 'expired'].includes(execution.state)) await update('failed', `PROVIDER_${status.toUpperCase()}`)
  } else if (input.order.tx_hash || ['deposited', 'pending', 'fulfilling', 'fulfilled', 'settling', 'refunding'].includes(status)) {
    if (execution.state === 'authorized') await update('submitted')
    if (execution.state === 'submitted' || execution.state === 'needs_review') await update('processing')
  }
  return execution
}

export async function syncPosSettlementExecutionByResource(order: PaycrestOrderRecord, repository: PaymentExecutionRepository = paymentExecutionRepository) {
  if (order.source !== 'ngpos') return undefined
  const execution = await repository.findByResourceAnyOwner(order.intent_id, 'pos_settlement')
  if (!execution) return undefined
  return syncPosSettlementExecution({ ownerId: execution.ownerId, order }, repository)
}

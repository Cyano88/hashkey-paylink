import type { CirclePocketActionRecord } from '../circle-pocket-action-journal.js'
import { paymentExecutionRepository, type PaymentExecutionIntent, type PaymentExecutionRepository } from './payment-execution-intents.js'

const ACTION = 'marketplace.service.purchase'

export async function syncMarketplacePaymentExecution(action: CirclePocketActionRecord, repository: PaymentExecutionRepository = paymentExecutionRepository) {
  if (action.action !== ACTION) return undefined
  const amount = action.metadata?.amount || ''
  if (!amount) return undefined
  const created = await repository.create({
    ownerId: action.ownerId,
    idempotencyKey: action.idempotencyKey,
    kind: 'service_funding',
    amount,
    sourceNetwork: 'circle-gateway-mainnet',
    settlementNetwork: 'circle-gateway-mainnet',
    destinationType: 'marketplace_service',
    metadata: { resource: action.metadata?.resource || '' },
  })
  let execution = created.intent
  if (!execution.resourceId) execution = await repository.update({ ownerId: action.ownerId, intentId: execution.id, resourceId: action.id })

  const paymentState = action.metadata?.paymentState || ''
  const reference = {
    providerReference: action.resourceId || action.metadata?.paymentTransferId,
    transactionHash: action.metadata?.paymentTxHash || action.metadata?.paymentTransferId,
    metadata: { actionStatus: action.status, paymentState, provider: action.metadata?.provider || '' },
  }
  const update = async (state: PaymentExecutionIntent['state'], failureCode?: string) => {
    execution = await repository.update({ ownerId: action.ownerId, intentId: execution.id, state, failureCode, ...reference })
  }

  if (execution.state === 'prepared') await update('authorized')
  const submitted = action.status === 'submitted' || Boolean(action.metadata?.paymentNonce) || Boolean(action.metadata?.paymentTransferId)
  if (submitted && execution.state === 'authorized') await update('submitted')

  if (action.status === 'completed' || paymentState === 'confirmed' || paymentState === 'completed') {
    if (execution.state === 'authorized') await update('submitted')
    if (execution.state === 'submitted' || execution.state === 'processing' || execution.state === 'needs_review') await update('completed')
  } else if (paymentState === 'needs_review') {
    if (!['completed', 'failed', 'expired', 'needs_review'].includes(execution.state)) await update('needs_review', 'PAYMENT_RECONCILIATION_REQUIRED')
  } else if (action.status === 'failed' && paymentState === 'failed') {
    if (!['completed', 'failed', 'expired'].includes(execution.state)) await update('failed', 'MARKETPLACE_PAYMENT_FAILED')
  } else if (submitted && (execution.state === 'submitted' || execution.state === 'needs_review')) {
    await update('processing')
  } else if (action.status === 'failed' && execution.state === 'authorized') {
    await update('failed', 'MARKETPLACE_REQUEST_FAILED')
  }
  return execution
}

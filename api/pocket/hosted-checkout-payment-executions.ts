import type { CheckoutRecord } from '../hosted-checkouts.js'
import { paymentExecutionRepository, type PaymentExecutionIntent, type PaymentExecutionRepository } from './payment-execution-intents.js'

function ownerId(record: CheckoutRecord) {
  return `partner:${record.partnerId}`
}

function paymentAmount(record: CheckoutRecord) {
  return record.payment?.amount || record.amount
}

function executionKind(record: CheckoutRecord) {
  return record.providerFunding ? 'service_funding' as const : 'hosted_checkout' as const
}

function paymentMetadata(record: CheckoutRecord) {
  const attempt = record.paymentAttempts?.[record.paymentAttempts.length - 1]
  return {
    checkoutKind: record.kind,
    checkoutMode: record.checkoutMode || 'human',
    partnerId: record.partnerId,
    merchantName: record.merchantName,
    title: record.title,
    memo: record.memo,
    payerWallet: record.payment?.payer.toLowerCase() || '',
    provider: record.providerFunding?.provider || '',
    fundingRequestId: record.providerFunding?.requestId || '',
    receiptId: attempt?.receiptId || '',
    receiptUrl: attempt?.receiptUrl || '',
  }
}

function checkoutMetadata(record: CheckoutRecord) {
  return {
    checkoutKind: record.kind,
    checkoutMode: record.checkoutMode || 'human',
    partnerId: record.partnerId,
    merchantName: record.merchantName,
    title: record.title,
    memo: record.memo,
    provider: record.providerFunding?.provider || '',
    fundingRequestId: record.providerFunding?.requestId || '',
  }
}

export async function ensureHostedCheckoutExecution(record: CheckoutRecord, repository: PaymentExecutionRepository = paymentExecutionRepository) {
  const amount = paymentAmount(record)
  if (!amount) return undefined
  const multiNetwork = (record.paymentOptions?.length ?? 0) > 1
  const executionNetwork = multiNetwork ? 'multi' : record.payment?.network || record.network
  const created = await repository.create({
    ownerId: ownerId(record),
    idempotencyKey: `pocket:hosted-checkout:${record.id}`,
    kind: executionKind(record),
    amount,
    sourceNetwork: executionNetwork,
    settlementNetwork: record.settlement ? 'base' : executionNetwork,
    destinationType: record.settlement ? 'verified_merchant_bank_account' : 'partner_checkout',
    metadata: checkoutMetadata(record),
  })
  if (created.intent.resourceId) return created.intent
  return repository.update({
    ownerId: ownerId(record),
    intentId: created.intent.id,
    resourceId: record.id,
    providerReference: record.settlement?.orderId,
  })
}

export async function expireHostedCheckoutExecution(record: CheckoutRecord, repository: PaymentExecutionRepository = paymentExecutionRepository) {
  if (record.payment) return undefined
  const execution = await repository.findByResource(ownerId(record), record.id, executionKind(record))
  if (!execution || (execution.state !== 'prepared' && execution.state !== 'authorized')) return execution
  return repository.update({ ownerId: ownerId(record), intentId: execution.id, state: 'expired', failureCode: 'CHECKOUT_EXPIRED' })
}

export async function syncHostedCheckoutExecution(
  record: CheckoutRecord,
  repository: PaymentExecutionRepository = paymentExecutionRepository,
  options: { providerCompleted?: boolean } = {},
) {
  let execution = await ensureHostedCheckoutExecution(record, repository)
  if (!execution || !record.payment) return execution
  const reference = {
    transactionHash: record.payment.txHash,
    providerReference: record.settlement?.orderId,
    metadata: { ...paymentMetadata(record), paymentStatus: record.payment.status, settlementStatus: record.payout?.status || '' },
  }
  execution = await repository.update({ ownerId: ownerId(record), intentId: execution.id, ...reference })
  const update = async (state: PaymentExecutionIntent['state'], failureCode?: string) => {
    execution = await repository.update({ ownerId: ownerId(record), intentId: execution!.id, state, failureCode, ...reference })
  }

  if (execution.state === 'prepared') await update('authorized')
  if (execution.state === 'authorized') await update('submitted')

  if (record.payment.status === 'failed') {
    if (!['completed', 'failed', 'expired'].includes(execution.state)) await update('failed', 'CHECKOUT_PAYMENT_FAILED')
  } else if (record.providerFunding && record.payment.status === 'paid' && options.providerCompleted) {
    if (execution.state === 'submitted' || execution.state === 'processing' || execution.state === 'needs_review') await update('completed')
  } else if (record.providerFunding && record.payment.status === 'paid') {
    if (execution.state === 'submitted' || execution.state === 'needs_review') await update('processing')
  } else if (!record.settlement && record.payment.status === 'paid') {
    if (execution.state === 'submitted' || execution.state === 'processing' || execution.state === 'needs_review') await update('completed')
  } else if (record.settlement && record.payment.status === 'paid' && ['validated', 'settled'].includes(record.payout?.status || '')) {
    if (execution.state === 'submitted' || execution.state === 'processing' || execution.state === 'needs_review') await update('completed')
  } else if (execution.state === 'submitted' || execution.state === 'needs_review') {
    await update('processing')
  }
  return execution
}

import type { ArcAgreementActivationAttempt } from './arc-agreement-activation-attempts.js'
import type { ArcAgreementOperatorAction } from './arc-agreement-operator-actions.js'
import type { ArcAgreementPayerLifecycleAction } from './arc-agreement-payer-lifecycle.js'
import { createArcAgreementReceipt } from './arc-agreement-receipt.js'
import { publicArcAgreementReleaseRequest } from './arc-agreement-creator-actions.js'

type AgreementDraft = {
  id: string
  title: string
  description: string
  template: 'fixed_unlock' | 'progressive_release' | 'milestone'
  amount: string
  recipient: string
  durationSeconds: number
  cancellationWindowSeconds: number
  checkpoints?: Array<{ label?: string; percentage: number }>
  milestones?: Array<{ label: string; percentage: number }>
  createdAt: string
  updatedAt: string
}

function units(value: unknown) {
  const normalized = String(value ?? '').trim()
  return /^\d{1,40}$/.test(normalized) ? normalized : '0'
}

function nonNegativeDifference(totalValue: unknown, releasedValue: unknown) {
  const total = BigInt(units(totalValue))
  const released = BigInt(units(releasedValue))
  return (total > released ? total - released : 0n).toString()
}

function lifecycleStatus(attempt?: ArcAgreementActivationAttempt) {
  if (!attempt) return 'awaiting_start'
  if (attempt.lifecycle) return attempt.lifecycle.status
  if (attempt.status === 'active') return 'active'
  if (['approval_failed', 'activation_failed', 'reconciliation_failed'].includes(attempt.status)) {
    return 'activation_failed'
  }
  return 'awaiting_start'
}

function transactionForReceipt(
  status: string,
  operatorActions: ArcAgreementOperatorAction[],
  payerActions: ArcAgreementPayerLifecycleAction[],
) {
  if (status === 'completed') {
    return operatorActions.find(action => (
      action.action === 'release' && action.status === 'completed' && action.transactionHash
    ))?.transactionHash
  }
  const expectedAction = status === 'cancelled' ? 'cancel' : status === 'refunded' ? 'refund' : ''
  return payerActions.find(action => (
    action.action === expectedAction && action.status === 'confirmed' && action.transactionHash
  ))?.transactionHash
}

export function createArcAgreementDeveloperView(input: {
  draft: AgreementDraft
  attempt?: ArcAgreementActivationAttempt
  operatorActions?: ArcAgreementOperatorAction[]
  payerActions?: ArcAgreementPayerLifecycleAction[]
}) {
  const operatorActions = [...(input.operatorActions ?? [])]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const payerActions = [...(input.payerActions ?? [])]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const attempt = input.attempt
  const lifecycle = attempt?.lifecycle
  const status = lifecycleStatus(attempt)
  const terminal = ['completed', 'cancelled', 'refunded'].includes(status)
  const releasedUsdcUnits = units(lifecycle?.releasedAmountUsdcUnits)
  const amountUsdcUnits = units(attempt?.prepared.totalAmount)
  const returnedUsdcUnits = terminal && status !== 'completed'
    ? nonNegativeDifference(amountUsdcUnits, releasedUsdcUnits)
    : '0'
  const transactionHash = transactionForReceipt(status, operatorActions, payerActions)
  const receipt = terminal && attempt?.escrow && lifecycle && transactionHash
    ? createArcAgreementReceipt({
        agreementId: input.draft.id,
        title: input.draft.title,
        description: input.draft.description,
        template: input.draft.template,
        status: status as 'completed' | 'cancelled' | 'refunded',
        payer: attempt.prepared.payer,
        recipient: attempt.prepared.recipient,
        escrow: attempt.escrow,
        transactionHash,
        eventId: lifecycle.eventId,
        createdAt: lifecycle.observedAt,
        amountUsdcUnits,
        releasedUsdcUnits,
        returnedUsdcUnits,
      })
    : null
  const releaseRequest = publicArcAgreementReleaseRequest(operatorActions.find(action => action.action === 'release'))

  return {
    status,
    chain: attempt?.escrow ? {
      network: 'arc' as const,
      chainId: 5_042_002,
      escrow: attempt.escrow,
      onchainAgreementId: attempt.prepared.agreementId,
      termsHash: attempt.prepared.termsHash,
      amountUsdcUnits,
      releasedUsdcUnits,
      remainingUsdcUnits: terminal ? '0' : nonNegativeDifference(amountUsdcUnits, releasedUsdcUnits),
      nextStep: lifecycle?.nextStep ?? 0,
      releaseSteps: attempt.prepared.cumulativeReleaseBps.length,
      observedBlockNumber: lifecycle?.observedBlockNumber ?? attempt.observedBlockNumber ?? '',
      observedAt: lifecycle?.observedAt ?? '',
    } : null,
    releaseRequest,
    receipt,
    updatedAt: lifecycle?.observedAt ?? attempt?.updatedAt ?? input.draft.updatedAt,
  }
}

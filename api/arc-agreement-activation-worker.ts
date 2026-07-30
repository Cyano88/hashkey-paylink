import { randomUUID } from 'node:crypto'
import {
  claimArcAgreementActivationReconciliations,
  completeArcAgreementActivationReconciliation,
  failArcAgreementActivationReconciliation,
  reconcileArcAgreementActivationAttempt,
  type ArcAgreementActivationClient,
  type ArcAgreementActivationReconciliationClaim,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'

type WorkerDependencies = {
  enabled: () => boolean
  claim: (input: {
    workerId: string
    maxAttempts?: number
    leaseMs?: number
  }) => Promise<ArcAgreementActivationReconciliationClaim[]>
  reconcile: typeof reconcileArcAgreementActivationAttempt
  complete: typeof completeArcAgreementActivationReconciliation
  fail: typeof failArcAgreementActivationReconciliation
  client: () => ArcAgreementActivationClient
}

const workerId = `arc-activation:${randomUUID()}`
let drainInFlight = false

const defaults: WorkerDependencies = {
  enabled: () => String(process.env.ARC_AGREEMENT_RECONCILIATION_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true',
  claim: claimArcAgreementActivationReconciliations,
  reconcile: reconcileArcAgreementActivationAttempt,
  complete: completeArcAgreementActivationReconciliation,
  fail: failArcAgreementActivationReconciliation,
  client: createArcAgreementActivationClient,
}

export async function drainArcAgreementActivationReconciliations(
  dependencies: WorkerDependencies = defaults,
) {
  const enabled = dependencies.enabled()
  if (!enabled || drainInFlight) {
    return { enabled, claimed: 0, reconciled: 0, pending: 0, failed: 0 }
  }
  drainInFlight = true
  try {
    const claims = await dependencies.claim({ workerId, maxAttempts: 10, leaseMs: 30_000 })
    if (claims.length === 0) return { enabled: true, claimed: 0, reconciled: 0, pending: 0, failed: 0 }
    let client: ArcAgreementActivationClient
    try {
      client = dependencies.client()
    } catch (error) {
      for (const claim of claims) {
        await dependencies.fail({
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          error,
        })
      }
      return { enabled: true, claimed: claims.length, reconciled: 0, pending: 0, failed: claims.length }
    }
    let reconciled = 0
    let pending = 0
    let failed = 0
    for (const claim of claims) {
      try {
        const result = await dependencies.reconcile({
          client,
          policy: { partnerId: claim.partnerId },
          agreementId: claim.agreementId,
        })
        await dependencies.complete({
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          pending: result.pending,
          retryAfterMs: 10_000,
        })
        if (result.pending) pending += 1
        else reconciled += 1
      } catch (error) {
        failed += 1
        await dependencies.fail({
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          error,
        })
      }
    }
    return { enabled: true, claimed: claims.length, reconciled, pending, failed }
  } finally {
    drainInFlight = false
  }
}

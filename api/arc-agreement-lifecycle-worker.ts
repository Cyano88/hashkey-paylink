import { randomUUID } from 'node:crypto'
import {
  claimArcAgreementLifecycleReconciliations,
  completeArcAgreementLifecycleReconciliation,
  failArcAgreementLifecycleReconciliation,
  type ArcAgreementActivationClient,
  type ArcAgreementLifecycleObservation,
  type ArcAgreementLifecycleReconciliationClaim,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import { readConfirmedArcAgreementSnapshot } from './arc-agreement-confirmed-snapshot.js'
import { reconcileArcAgreementSnapshot } from './arc-agreement-reconciliation.js'
import {
  buildArcAgreementWebhookEvent,
  queueArcAgreementWebhookEvent,
} from './arc-agreement-webhooks.js'

type WorkerDependencies = {
  enabled: () => boolean
  claim: (input: {
    workerId: string
    maxAttempts?: number
    leaseMs?: number
  }) => Promise<ArcAgreementLifecycleReconciliationClaim[]>
  confirmed: typeof readConfirmedArcAgreementSnapshot
  queue: typeof queueArcAgreementWebhookEvent
  complete: typeof completeArcAgreementLifecycleReconciliation
  fail: typeof failArcAgreementLifecycleReconciliation
  client: () => ArcAgreementActivationClient
  now: () => Date
}

const workerId = `arc-lifecycle:${randomUUID()}`
let drainInFlight = false

const defaults: WorkerDependencies = {
  enabled: () => String(process.env.ARC_AGREEMENT_LIFECYCLE_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true',
  claim: claimArcAgreementLifecycleReconciliations,
  confirmed: readConfirmedArcAgreementSnapshot,
  queue: queueArcAgreementWebhookEvent,
  complete: completeArcAgreementLifecycleReconciliation,
  fail: failArcAgreementLifecycleReconciliation,
  client: createArcAgreementActivationClient,
  now: () => new Date(),
}

function blockTimestampIso(timestamp: bigint) {
  if (timestamp < 0n || timestamp > 8_640_000_000_000n) {
    throw new Error('Confirmed Arc block timestamp is outside the supported range.')
  }
  const value = new Date(Number(timestamp) * 1_000)
  if (!Number.isFinite(value.getTime())) throw new Error('Confirmed Arc block timestamp is invalid.')
  return value.toISOString()
}

function assertMonotonicObservation(
  claim: ArcAgreementLifecycleReconciliationClaim,
  input: {
    observedBlockNumber: bigint
    observedBlockTimestamp: bigint
    status: ArcAgreementLifecycleObservation['status']
    nextStep: number
    releasedAmount: bigint
  },
) {
  if (
    claim.lastObservedBlockNumber !== undefined
    && input.observedBlockNumber < BigInt(claim.lastObservedBlockNumber)
  ) {
    throw new Error('Confirmed Arc observation regressed behind the durable block boundary.')
  }
  if (claim.lastNextStep !== undefined && input.nextStep < claim.lastNextStep) {
    throw new Error('Confirmed Arc release step regressed behind the durable lifecycle.')
  }
  if (
    claim.lastObservedBlockTimestamp !== undefined
    && input.observedBlockTimestamp * 1_000n < BigInt(Date.parse(claim.lastObservedBlockTimestamp))
  ) {
    throw new Error('Confirmed Arc block time regressed behind the durable lifecycle.')
  }
  if (
    claim.lastReleasedAmountUsdcUnits !== undefined
    && input.releasedAmount < BigInt(claim.lastReleasedAmountUsdcUnits)
  ) {
    throw new Error('Confirmed Arc released amount regressed behind the durable lifecycle.')
  }
  if (claim.lastStatus === 'expired' && input.status === 'active') {
    throw new Error('Confirmed Arc lifecycle regressed from expired to active.')
  }
}

export async function drainArcAgreementLifecycleReconciliations(
  dependencies: WorkerDependencies = defaults,
) {
  const enabled = dependencies.enabled()
  if (!enabled || drainInFlight) {
    return { enabled, claimed: 0, changed: 0, unchanged: 0, terminal: 0, failed: 0 }
  }
  drainInFlight = true
  try {
    const claims = await dependencies.claim({ workerId, maxAttempts: 10, leaseMs: 60_000 })
    if (claims.length === 0) {
      return { enabled: true, claimed: 0, changed: 0, unchanged: 0, terminal: 0, failed: 0 }
    }
    let client: ArcAgreementActivationClient
    try {
      client = dependencies.client()
    } catch (error) {
      for (const claim of claims) {
        await dependencies.fail({ attemptId: claim.attemptId, leaseToken: claim.leaseToken, error })
      }
      return {
        enabled: true,
        claimed: claims.length,
        changed: 0,
        unchanged: 0,
        terminal: 0,
        failed: claims.length,
      }
    }

    let changed = 0
    let unchanged = 0
    let terminal = 0
    let failed = 0
    for (const claim of claims) {
      try {
        const confirmed = await dependencies.confirmed(client, claim.escrow)
        const reconciliation = reconcileArcAgreementSnapshot(claim.prepared, confirmed.snapshot)
        if (!reconciliation.verified) {
          throw new Error(`Agreement snapshot failed reconciliation: ${reconciliation.mismatches.join(', ')}.`)
        }
        const block = await client.getBlock({ blockNumber: confirmed.observedBlockNumber })
        const observedBlockTimestamp = block.timestamp
        const observedAt = dependencies.now().toISOString()
        const event = buildArcAgreementWebhookEvent({
          partnerId: claim.partnerId,
          agreementId: claim.agreementId,
          prepared: claim.prepared,
          snapshot: confirmed.snapshot,
          observedBlockNumber: confirmed.observedBlockNumber,
          observedBlockTimestamp,
          createdAt: observedAt,
        })
        const lifecycleStatus = event.event === 'agreement.expired'
          ? 'expired'
          : reconciliation.lifecycle
        if (!['active', 'expired', 'completed', 'cancelled', 'refunded'].includes(lifecycleStatus)) {
          throw new Error(`Unsupported verified agreement lifecycle: ${lifecycleStatus}.`)
        }
        assertMonotonicObservation(claim, {
          observedBlockNumber: confirmed.observedBlockNumber,
          observedBlockTimestamp,
          status: lifecycleStatus as ArcAgreementLifecycleObservation['status'],
          nextStep: confirmed.snapshot.nextStep,
          releasedAmount: confirmed.snapshot.releasedAmount,
        })
        const eventChanged = event.id !== claim.lastEventId
        if (eventChanged) {
          await dependencies.queue(event)
        }
        const observation: ArcAgreementLifecycleObservation = {
          status: lifecycleStatus as ArcAgreementLifecycleObservation['status'],
          nextStep: confirmed.snapshot.nextStep,
          releasedAmountUsdcUnits: reconciliation.releasedAmount,
          obligationAmountUsdcUnits: reconciliation.obligationAmount,
          excessAmountUsdcUnits: reconciliation.excessAmount,
          observedBlockNumber: confirmed.observedBlockNumber.toString(),
          observedBlockTimestamp: blockTimestampIso(observedBlockTimestamp),
          eventId: event.id,
          observedAt,
        }
        await dependencies.complete({
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          observation,
          pollAfterMs: 15_000,
        })
        if (eventChanged) changed += 1
        else unchanged += 1
        if (['completed', 'cancelled', 'refunded'].includes(observation.status)) terminal += 1
      } catch (error) {
        failed += 1
        await dependencies.fail({
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          error,
        })
      }
    }
    return { enabled: true, claimed: claims.length, changed, unchanged, terminal, failed }
  } finally {
    drainInFlight = false
  }
}

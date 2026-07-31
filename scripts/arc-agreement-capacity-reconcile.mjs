import {
  arcAgreementProjectCapacitySnapshot,
  listArcAgreementActivationAttemptRecords,
  readArcAgreementActivationBinding,
  recordArcAgreementLifecycleObservation,
} from '../api/arc-agreement-activation-attempts.ts'
import { createArcAgreementActivationClient } from '../api/arc-agreement-activation-client.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import { reconcileArcAgreementSnapshot } from '../api/arc-agreement-reconciliation.ts'
import { buildArcAgreementWebhookEvent } from '../api/arc-agreement-webhooks.ts'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] ?? '').trim() : ''
}

const partnerId = argument('--project')
const agreementId = argument('--agreement')
const confirmed = process.argv.includes('--confirm-terminal-capacity-reconciliation')

if (!confirmed) {
  throw new Error('Explicit --confirm-terminal-capacity-reconciliation approval is required.')
}
if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId) || !/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
  throw new Error('A valid --project and --agreement are required.')
}

const client = createArcAgreementActivationClient()
const binding = await readArcAgreementActivationBinding(partnerId, agreementId)
const chain = await readConfirmedArcAgreementSnapshot(client, binding.escrow, 5)
const reconciliation = reconcileArcAgreementSnapshot(binding.prepared, chain.snapshot)
if (!reconciliation.verified) {
  throw new Error(`Agreement snapshot failed reconciliation: ${reconciliation.mismatches.join(', ')}.`)
}
if (!['completed', 'cancelled', 'refunded'].includes(reconciliation.lifecycle)) {
  throw new Error(`Agreement is not terminal on Arc; authoritative lifecycle is ${reconciliation.lifecycle}.`)
}
const block = await client.getBlock({ blockNumber: chain.observedBlockNumber })
const observedAt = new Date().toISOString()
const event = buildArcAgreementWebhookEvent({
  partnerId,
  agreementId,
  prepared: binding.prepared,
  snapshot: chain.snapshot,
  observedBlockNumber: chain.observedBlockNumber,
  observedBlockTimestamp: block.timestamp,
  createdAt: observedAt,
})
const recorded = await recordArcAgreementLifecycleObservation(partnerId, agreementId, {
  status: reconciliation.lifecycle,
  nextStep: chain.snapshot.nextStep,
  releasedAmountUsdcUnits: reconciliation.releasedAmount,
  obligationAmountUsdcUnits: reconciliation.obligationAmount,
  excessAmountUsdcUnits: reconciliation.excessAmount,
  observedBlockNumber: chain.observedBlockNumber.toString(),
  observedBlockTimestamp: new Date(Number(block.timestamp) * 1_000).toISOString(),
  eventId: event.id,
  observedAt,
})
const attempts = await listArcAgreementActivationAttemptRecords({ partnerId, limit: 250 })
const capacity = arcAgreementProjectCapacitySnapshot({
  attempts,
  partnerId,
  utcDay: observedAt.slice(0, 10),
})

console.log(JSON.stringify({
  ok: true,
  agreementId,
  lifecycle: recorded.attempt.lifecycle?.status,
  observedBlockNumber: recorded.attempt.lifecycle?.observedBlockNumber,
  replayed: recorded.replayed,
  activeAgreements: capacity.activeAgreements,
  dailyVolumeUsdcUnits: capacity.dailyVolumeUsdcUnits.toString(),
}, null, 2))

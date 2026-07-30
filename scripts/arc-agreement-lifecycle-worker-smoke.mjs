import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import { buildArcAgreementWebhookEvent } from '../api/arc-agreement-webhooks.ts'
import {
  claimArcAgreementLifecycleReconciliations,
  completeArcAgreementLifecycleReconciliation,
  failArcAgreementLifecycleReconciliation,
} from '../api/arc-agreement-activation-attempts.ts'
import { drainArcAgreementLifecycleReconciliations } from '../api/arc-agreement-lifecycle-worker.ts'

const partnerId = 'dev_lifecycleworker1234'
const agreementId = 'agr_lifecycleworker1234'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:lifecycle-worker-test',
  title: 'Lifecycle worker test',
  description: 'Verify confirmed automatic Arc Agreement lifecycle discovery.',
  amount: '10',
  recipient,
  checkpoints: [{ percentage: 25 }, { percentage: 50 }, { percentage: 100 }],
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
})
const prepared = prepareArcAgreementDeployment({
  draft: {
    clientReference: arcAgreementClientReference(partnerId, agreementId),
    termsHash: terms.termsHash,
    chainTerms: terms,
  },
  payer,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
})
const releasedAmount = prepared.totalAmount * 2_500n / 10_000n
const snapshot = (escrow, overrides = {}) => ({
  ...prepared,
  escrow,
  status: 1,
  nextStep: 1,
  releasedAmount,
  tokenBalance: prepared.totalAmount - releasedAmount,
  ...overrides,
})
const escrows = {
  changed: '0x5000000000000000000000000000000000000001',
  unchanged: '0x5000000000000000000000000000000000000002',
  expired: '0x5000000000000000000000000000000000000003',
  completed: '0x5000000000000000000000000000000000000004',
  invalid: '0x5000000000000000000000000000000000000005',
  regressed: '0x5000000000000000000000000000000000000006',
}
const snapshots = {
  [escrows.changed]: snapshot(escrows.changed),
  [escrows.unchanged]: snapshot(escrows.unchanged),
  [escrows.expired]: snapshot(escrows.expired),
  [escrows.completed]: snapshot(escrows.completed, {
    status: 2,
    nextStep: prepared.cumulativeReleaseBps.length,
    releasedAmount: prepared.totalAmount,
    tokenBalance: 0n,
  }),
  [escrows.invalid]: snapshot(escrows.invalid, { termsHash: `0x${'ff'.repeat(32)}` }),
  [escrows.regressed]: snapshot(escrows.regressed),
}
const blockNumbers = Object.fromEntries(Object.keys(snapshots).map((escrow, index) => [escrow, BigInt(100 + index)]))
const timestamps = Object.fromEntries(Object.values(blockNumbers).map(blockNumber => [
  blockNumber.toString(),
  blockNumber === blockNumbers[escrows.expired] ? prepared.expiresAt : prepared.expiresAt - 1n,
]))
const unchangedEvent = buildArcAgreementWebhookEvent({
  partnerId,
  agreementId,
  prepared,
  snapshot: snapshots[escrows.unchanged],
  observedBlockNumber: blockNumbers[escrows.unchanged],
  observedBlockTimestamp: timestamps[blockNumbers[escrows.unchanged].toString()],
  createdAt: '2026-07-29T12:00:00.000Z',
})
const claims = Object.entries(escrows).map(([name, escrow], index) => ({
  attemptId: `attempt-${name}`,
  partnerId,
  agreementId,
  escrow,
  prepared,
  ...(name === 'unchanged' ? { lastEventId: unchangedEvent.id } : {}),
  ...(name === 'regressed' ? { lastObservedBlockNumber: '999' } : {}),
  leaseToken: `lease-${index}`,
}))
const queued = []
const completed = []
const failed = []
const fakeClient = {
  getBlock: async ({ blockNumber }) => ({ timestamp: timestamps[blockNumber.toString()] }),
}

const disabled = await drainArcAgreementLifecycleReconciliations({
  enabled: () => false,
  claim: async () => { throw new Error('disabled worker must not claim') },
  confirmed: async () => { throw new Error('disabled worker must not read') },
  queue: async () => {},
  complete: async () => {},
  fail: async () => {},
  client: () => fakeClient,
  now: () => new Date('2026-07-29T12:00:00.000Z'),
})
assert.deepEqual(disabled, { enabled: false, claimed: 0, changed: 0, unchanged: 0, terminal: 0, failed: 0 })

const result = await drainArcAgreementLifecycleReconciliations({
  enabled: () => true,
  claim: async input => {
    assert.match(input.workerId, /^arc-lifecycle:/)
    assert.equal(input.leaseMs, 60_000)
    return claims
  },
  confirmed: async (_client, escrow) => ({
    snapshot: snapshots[escrow],
    headBlockNumber: blockNumbers[escrow] + 5n,
    observedBlockNumber: blockNumbers[escrow],
    confirmations: 5,
  }),
  queue: async event => {
    queued.push(event)
    return { event, replayed: false }
  },
  complete: async input => { completed.push(input) },
  fail: async input => { failed.push(input) },
  client: () => fakeClient,
  now: () => new Date('2026-07-29T12:00:00.000Z'),
})
assert.deepEqual(result, { enabled: true, claimed: 6, changed: 3, unchanged: 1, terminal: 1, failed: 2 })
assert.deepEqual(queued.map(event => event.event), [
  'agreement.step_released',
  'agreement.expired',
  'agreement.completed',
])
assert.equal(queued[1].data.status, 'expired')
assert.equal(completed.length, 4)
assert.equal(completed.find(item => item.attemptId === 'attempt-expired').observation.status, 'expired')
assert.equal(completed.find(item => item.attemptId === 'attempt-completed').observation.status, 'completed')
assert.equal(failed.length, 2)
assert.match(failed.find(item => item.attemptId === 'attempt-invalid').error.message, /termsHash/)
assert.match(failed.find(item => item.attemptId === 'attempt-regressed').error.message, /regressed/)

const configurationFailures = []
const configurationFailure = await drainArcAgreementLifecycleReconciliations({
  enabled: () => true,
  claim: async () => [claims[0]],
  confirmed: async () => { throw new Error('must not read without a client') },
  queue: async () => {},
  complete: async () => {},
  fail: async input => { configurationFailures.push(input) },
  client: () => { throw new Error('Arc RPC is not configured') },
  now: () => new Date(),
})
assert.deepEqual(configurationFailure, {
  enabled: true,
  claimed: 1,
  changed: 0,
  unchanged: 0,
  terminal: 0,
  failed: 1,
})
assert.equal(configurationFailures.length, 1)

let nowMs = Date.parse('2026-07-29T12:00:00.000Z')
const storedPrepared = {
  ...prepared,
  totalAmount: prepared.totalAmount.toString(),
  cancelUntil: prepared.cancelUntil.toString(),
  expiresAt: prepared.expiresAt.toString(),
}
let durableState = {
  attempts: {
    'attempt-durable': {
      id: 'attempt-durable',
      partnerId,
      agreementId,
      status: 'active',
      escrow: escrows.changed,
      prepared: storedPrepared,
      createdAt: '2026-07-29T11:59:00.000Z',
    },
  },
  transactionIndex: {},
}
const durableDependencies = {
  hasStore: () => true,
  read: async () => durableState,
  mutate: async (_key, update) => {
    durableState = await update(durableState)
    return durableState
  },
  queueWebhook: async () => {},
  now: () => new Date(nowMs),
}
const firstLease = await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:first',
}, durableDependencies)
assert.equal(firstLease.length, 1)
assert.equal(typeof firstLease[0].prepared.totalAmount, 'bigint')
assert.equal((await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:second',
}, durableDependencies)).length, 0)

await failArcAgreementLifecycleReconciliation({
  attemptId: firstLease[0].attemptId,
  leaseToken: firstLease[0].leaseToken,
  error: new Error('temporary\nRPC failure'),
}, durableDependencies)
assert.equal(durableState.lifecycleJobs['attempt-durable'].lastError, 'temporary RPC failure')
nowMs += 5_000
const retryLease = await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:second',
}, durableDependencies)
assert.equal(retryLease.length, 1)
const activeObservation = completed.find(item => item.attemptId === 'attempt-changed').observation
await completeArcAgreementLifecycleReconciliation({
  attemptId: retryLease[0].attemptId,
  leaseToken: firstLease[0].leaseToken,
  observation: activeObservation,
}, durableDependencies)
assert.equal(durableState.lifecycleJobs['attempt-durable'].leaseToken, retryLease[0].leaseToken)
await completeArcAgreementLifecycleReconciliation({
  attemptId: retryLease[0].attemptId,
  leaseToken: retryLease[0].leaseToken,
  observation: activeObservation,
  pollAfterMs: 15_000,
}, durableDependencies)
assert.equal(durableState.attempts['attempt-durable'].lifecycle.status, 'active')
assert.equal(durableState.lifecycleJobs['attempt-durable'].leaseToken, undefined)

nowMs += 15_000
const terminalLease = await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:third',
}, durableDependencies)
const terminalObservation = completed.find(item => item.attemptId === 'attempt-completed').observation
await completeArcAgreementLifecycleReconciliation({
  attemptId: terminalLease[0].attemptId,
  leaseToken: terminalLease[0].leaseToken,
  observation: terminalObservation,
}, durableDependencies)
assert.equal(durableState.attempts['attempt-durable'].lifecycle.status, 'completed')
assert.equal(durableState.lifecycleJobs['attempt-durable'], undefined)
assert.equal((await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:fourth',
}, durableDependencies)).length, 0)

durableState = {
  attempts: Object.fromEntries(Array.from({ length: 11 }, (_unused, index) => {
    const id = `attempt-fair-${index.toString().padStart(2, '0')}`
    return [id, {
      id,
      partnerId,
      agreementId,
      status: 'active',
      escrow: escrows.changed,
      prepared: storedPrepared,
      createdAt: `2026-07-29T11:59:${index.toString().padStart(2, '0')}.000Z`,
    }]
  })),
  transactionIndex: {},
}
const firstBatch = await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:fairness-a',
  maxAttempts: 10,
}, durableDependencies)
assert.equal(firstBatch.length, 10)
for (const claim of firstBatch) {
  await completeArcAgreementLifecycleReconciliation({
    attemptId: claim.attemptId,
    leaseToken: claim.leaseToken,
    observation: activeObservation,
    pollAfterMs: 15_000,
  }, durableDependencies)
}
nowMs += 15_000
const fairBatch = await claimArcAgreementLifecycleReconciliations({
  workerId: 'lifecycle:fairness-b',
  maxAttempts: 10,
}, durableDependencies)
assert.equal(fairBatch.length, 10)
assert.ok(fairBatch.some(claim => claim.attemptId === 'attempt-fair-10'))

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /arcAgreementLifecycleReconciliationTimer = setInterval/)
assert.match(serverSource, /arcAgreementLifecycleReconciliationTimer\.unref\(\)/)
assert.match(serverSource, /startup reconciliation failed/)
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /^ARC_AGREEMENTS_ENABLED=false$/m)
assert.match(envExample, /^ARC_AGREEMENT_LIFECYCLE_WORKER_ENABLED=false$/m)

console.log('Arc Agreement lifecycle worker smoke test passed.')

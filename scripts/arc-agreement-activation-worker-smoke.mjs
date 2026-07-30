import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { drainArcAgreementActivationReconciliations } from '../api/arc-agreement-activation-worker.ts'
import {
  claimArcAgreementActivationReconciliations,
  completeArcAgreementActivationReconciliation,
  failArcAgreementActivationReconciliation,
} from '../api/arc-agreement-activation-attempts.ts'

const fakeClient = {
  getChainId: async () => 5_042_002,
  getBlockNumber: async () => 1n,
  getTransaction: async () => { throw new Error('unused') },
  getTransactionReceipt: async () => null,
  readContract: async () => { throw new Error('unused') },
}

let clientCalls = 0
const disabled = await drainArcAgreementActivationReconciliations({
  enabled: () => false,
  claim: async () => { throw new Error('disabled worker must not claim') },
  reconcile: async () => { throw new Error('disabled worker must not reconcile') },
  complete: async () => {},
  fail: async () => {},
  client: () => {
    clientCalls += 1
    return fakeClient
  },
})
assert.deepEqual(disabled, { enabled: false, claimed: 0, reconciled: 0, pending: 0, failed: 0 })
assert.equal(clientCalls, 0)

const completions = []
const failures = []
const policies = []
const claims = [
  { attemptId: 'attempt-a', partnerId: 'dev_partner_a', agreementId: 'agr_aaaaaaaaaaaa', leaseToken: 'lease-a' },
  { attemptId: 'attempt-b', partnerId: 'dev_partner_b', agreementId: 'agr_bbbbbbbbbbbb', leaseToken: 'lease-b' },
]
const result = await drainArcAgreementActivationReconciliations({
  enabled: () => true,
  claim: async input => {
    assert.match(input.workerId, /^arc-activation:/)
    assert.equal(input.maxAttempts, 10)
    assert.equal(input.leaseMs, 30_000)
    return claims
  },
  reconcile: async input => {
    policies.push(input.policy)
    if (input.agreementId === 'agr_bbbbbbbbbbbb') throw new Error('temporary RPC failure')
    return { attempt: { status: 'approval_submitted' }, changed: false, pending: true }
  },
  complete: async input => { completions.push(input) },
  fail: async input => { failures.push(input) },
  client: () => {
    clientCalls += 1
    return fakeClient
  },
})
assert.deepEqual(result, { enabled: true, claimed: 2, reconciled: 0, pending: 1, failed: 1 })
assert.deepEqual(policies, [{ partnerId: 'dev_partner_a' }, { partnerId: 'dev_partner_b' }])
assert.deepEqual(completions, [{
  attemptId: 'attempt-a',
  leaseToken: 'lease-a',
  pending: true,
  retryAfterMs: 10_000,
}])
assert.equal(failures.length, 1)
assert.equal(failures[0].attemptId, 'attempt-b')
assert.equal(failures[0].leaseToken, 'lease-b')
assert.match(failures[0].error.message, /temporary RPC failure/)
assert.equal(clientCalls, 1)

const configurationFailures = []
const configurationFailure = await drainArcAgreementActivationReconciliations({
  enabled: () => true,
  claim: async () => [claims[0]],
  reconcile: async () => { throw new Error('must not reconcile without a client') },
  complete: async () => {},
  fail: async input => { configurationFailures.push(input) },
  client: () => { throw new Error('Arc RPC is not configured') },
})
assert.deepEqual(configurationFailure, { enabled: true, claimed: 1, reconciled: 0, pending: 0, failed: 1 })
assert.equal(configurationFailures.length, 1)
assert.match(configurationFailures[0].error.message, /Arc RPC is not configured/)

let nowMs = Date.parse('2026-07-29T12:00:00.000Z')
let durableState = {
  attempts: {
    'attempt-durable': {
      id: 'attempt-durable',
      partnerId: 'dev_durable',
      agreementId: 'agr_durabledurable',
      status: 'activation_submitted',
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
const firstLease = await claimArcAgreementActivationReconciliations({
  workerId: 'worker:first',
  maxAttempts: 1,
  leaseMs: 30_000,
}, durableDependencies)
assert.equal(firstLease.length, 1)
assert.equal((await claimArcAgreementActivationReconciliations({
  workerId: 'worker:second',
  maxAttempts: 1,
  leaseMs: 30_000,
}, durableDependencies)).length, 0)

await failArcAgreementActivationReconciliation({
  attemptId: firstLease[0].attemptId,
  leaseToken: firstLease[0].leaseToken,
  error: new Error('temporary\nRPC   failure'),
}, durableDependencies)
assert.equal(durableState.reconciliationJobs['attempt-durable'].lastError, 'temporary RPC failure')
assert.equal((await claimArcAgreementActivationReconciliations({
  workerId: 'worker:second',
}, durableDependencies)).length, 0)

nowMs += 5_000
const retryLease = await claimArcAgreementActivationReconciliations({
  workerId: 'worker:second',
}, durableDependencies)
assert.equal(retryLease.length, 1)
await completeArcAgreementActivationReconciliation({
  attemptId: retryLease[0].attemptId,
  leaseToken: firstLease[0].leaseToken,
  pending: false,
}, durableDependencies)
assert.equal(durableState.reconciliationJobs['attempt-durable'].leaseToken, retryLease[0].leaseToken)
await completeArcAgreementActivationReconciliation({
  attemptId: retryLease[0].attemptId,
  leaseToken: retryLease[0].leaseToken,
  pending: true,
  retryAfterMs: 10_000,
}, durableDependencies)
assert.equal(durableState.reconciliationJobs['attempt-durable'].leaseToken, undefined)

nowMs += 10_000
const finalLease = await claimArcAgreementActivationReconciliations({
  workerId: 'worker:third',
}, durableDependencies)
assert.equal(finalLease.length, 1)
durableState.attempts['attempt-durable'].status = 'active'
await completeArcAgreementActivationReconciliation({
  attemptId: finalLease[0].attemptId,
  leaseToken: finalLease[0].leaseToken,
  pending: true,
}, durableDependencies)
assert.equal(durableState.reconciliationJobs['attempt-durable'], undefined)

durableState = {
  attempts: Object.fromEntries(Array.from({ length: 11 }, (_unused, index) => {
    const id = `attempt-fair-${index.toString().padStart(2, '0')}`
    return [id, {
      id,
      partnerId: 'dev_durable',
      agreementId: `agr_fair${index.toString().padStart(12, '0')}`,
      status: 'activation_submitted',
      createdAt: `2026-07-29T11:59:${index.toString().padStart(2, '0')}.000Z`,
    }]
  })),
  transactionIndex: {},
}
const firstBatch = await claimArcAgreementActivationReconciliations({
  workerId: 'worker:fairness-a',
  maxAttempts: 10,
}, durableDependencies)
assert.equal(firstBatch.length, 10)
for (const claim of firstBatch) {
  await completeArcAgreementActivationReconciliation({
    attemptId: claim.attemptId,
    leaseToken: claim.leaseToken,
    pending: true,
    retryAfterMs: 10_000,
  }, durableDependencies)
}
nowMs += 10_000
const fairBatch = await claimArcAgreementActivationReconciliations({
  workerId: 'worker:fairness-b',
  maxAttempts: 10,
}, durableDependencies)
assert.equal(fairBatch.length, 10)
assert.ok(fairBatch.some(claim => claim.attemptId === 'attempt-fair-10'))

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /arcAgreementActivationReconciliationTimer = setInterval/)
assert.match(serverSource, /arcAgreementActivationReconciliationTimer\.unref\(\)/)
assert.match(serverSource, /startup reconciliation failed/)

const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /^ARC_AGREEMENTS_ENABLED=false$/m)
assert.match(envExample, /^ARC_AGREEMENT_RECONCILIATION_WORKER_ENABLED=false$/m)

console.log('Arc Agreement activation worker smoke test passed.')

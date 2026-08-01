import assert from 'node:assert/strict'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import { prepareArcAgreementReleaseCall } from '../api/arc-agreement-operator.ts'
import { fetchAndVerifyArcAgreementOperatorWallet } from '../api/arc-agreement-operator-wallet.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import {
  approveArcAgreementOperatorAction,
  claimArcAgreementOperatorActions,
  completeArcAgreementOperatorAction,
  createArcAgreementOperatorActionRequest,
  disputeArcAgreementOperatorAction,
  readArcAgreementOperatorAction,
  recordArcAgreementOperatorSubmission,
} from '../api/arc-agreement-operator-actions.ts'

const partnerId = 'dev_operatorqueue1234'
const agreementId = 'agr_operatorqueue1234'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x5555555555555555555555555555555555555555'
const walletId = '123e4567-e89b-42d3-a456-426614174000'
const idempotencyKey = '123e4567-e89b-42d3-b456-426614174001'
const evidenceHash = `0x${'11'.repeat(32)}`
const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:operator-queue-test',
  title: 'Operator queue test',
  description: 'Validate evidence review and durable operator execution admission.',
  amount: '10',
  recipient,
  checkpoints: [{ percentage: 50 }, { percentage: 100 }],
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
const confirmed = await readConfirmedArcAgreementSnapshot({
  getChainId: async () => 5_042_002,
  getBlockNumber: async () => 100n,
  readContract: async args => {
    if (args.functionName === 'balanceOf') return prepared.totalAmount
    if (args.functionName === 'releaseSchedule') return prepared.cumulativeReleaseBps
    if (args.functionName === 'template') return prepared.templateCode
    if (args.functionName === 'status') return 1
    if (args.functionName === 'nextStep') return 0
    if (args.functionName === 'releasedAmount') return 0n
    return prepared[args.functionName]
  },
}, escrow, 5)
const operatorWallet = await fetchAndVerifyArcAgreementOperatorWallet({
  apiKey: 'TEST_API_KEY:operator-action-queue',
  walletId,
  expectedOperator: operator,
  requestId: '123e4567-e89b-42d3-a456-426614174002',
  fetchImpl: async () => new Response(JSON.stringify({
    data: {
      wallet: {
        id: walletId,
        address: operator,
        blockchain: 'ARC-TESTNET',
        custodyType: 'DEVELOPER',
        state: 'LIVE',
        accountType: 'EOA',
      },
    },
  }), { status: 200 }),
})
const call = prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash,
})

let store
let now = new Date('2026-07-30T10:00:00.000Z')
const dependencies = {
  hasStore: () => true,
  read: async () => store,
  mutate: async (_key, update) => {
    store = await update(store)
    return store
  },
  now: () => now,
}
const requestInput = {
  partnerId,
  agreementId,
  action: 'release',
  step: 0,
  evidenceHash,
  evidenceReference: 'case/operator-queue-001',
  deliveryNote: 'Completed the first delivery checkpoint.',
  requestedBy: 'operations.requester',
  idempotencyKey,
  preparedCall: call,
}
const requested = await createArcAgreementOperatorActionRequest(requestInput, dependencies)
assert.equal(requested.status, 'awaiting_review')
assert.equal(requested.preparedCall.contractAddress, escrow)
assert.equal((await createArcAgreementOperatorActionRequest(requestInput, dependencies)).id, requested.id)
await assert.rejects(() => createArcAgreementOperatorActionRequest({
  ...requestInput,
  evidenceReference: 'case/operator-queue-conflict',
}, dependencies), /idempotency key/)
assert.deepEqual(await claimArcAgreementOperatorActions({
  workerId: 'arc-operator:test-worker',
}, dependencies), [])
await assert.rejects(() => approveArcAgreementOperatorAction({
  actionId: requested.id,
  requestHash: requested.requestHash,
  reviewedBy: requestInput.requestedBy,
  reviewNote: 'Evidence checked against the delivery record.',
}, dependencies), /independent reviewer/)
const approved = await approveArcAgreementOperatorAction({
  actionId: requested.id,
  requestHash: requested.requestHash,
  reviewedBy: 'operations.reviewer',
  reviewNote: 'Evidence checked against the delivery record.',
}, dependencies)
assert.equal(approved.status, 'queued')
const secondIdempotencyKey = '123e4567-e89b-42d3-b456-426614174009'
const secondEvidenceHash = `0x${'22'.repeat(32)}`
const secondCall = prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey: secondIdempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash: secondEvidenceHash,
})
const secondRequest = await createArcAgreementOperatorActionRequest({
  ...requestInput,
  evidenceHash: secondEvidenceHash,
  evidenceReference: 'case/operator-queue-002',
  idempotencyKey: secondIdempotencyKey,
  preparedCall: secondCall,
}, dependencies)
await assert.rejects(() => approveArcAgreementOperatorAction({
  actionId: secondRequest.id,
  requestHash: secondRequest.requestHash,
  reviewedBy: 'operations.second-reviewer',
  reviewNote: 'Second evidence record reviewed independently.',
}, dependencies), /already open/)
await assert.rejects(() => disputeArcAgreementOperatorAction({
  actionId: secondRequest.id,
  requestHash: secondRequest.requestHash,
  reviewedBy: requestInput.requestedBy,
  reviewNote: 'The submitted work is incomplete.',
}, dependencies), /independent reviewer/)
const disputed = await disputeArcAgreementOperatorAction({
  actionId: secondRequest.id,
  requestHash: secondRequest.requestHash,
  reviewedBy: 'payer.reviewer',
  reviewNote: 'The submitted work is incomplete.',
}, dependencies)
assert.equal(disputed.status, 'disputed')

const [firstClaim] = await claimArcAgreementOperatorActions({
  workerId: 'arc-operator:test-worker',
  leaseMs: 10_000,
}, dependencies)
assert.ok(firstClaim.leaseToken)
assert.deepEqual(await claimArcAgreementOperatorActions({
  workerId: 'arc-operator:other-worker',
}, dependencies), [])
await recordArcAgreementOperatorSubmission({
  actionId: requested.id,
  leaseToken: 'wrong-lease',
  providerTransactionId: '123e4567-e89b-42d3-a456-426614174003',
}, dependencies)
assert.equal((await readArcAgreementOperatorAction(requested.id, dependencies)).status, 'queued')
await recordArcAgreementOperatorSubmission({
  actionId: requested.id,
  leaseToken: firstClaim.leaseToken,
  providerTransactionId: '123e4567-e89b-42d3-a456-426614174003',
}, dependencies)
assert.equal((await readArcAgreementOperatorAction(requested.id, dependencies)).status, 'provider_pending')

now = new Date('2026-07-30T10:00:06.000Z')
const [recoveryClaim] = await claimArcAgreementOperatorActions({
  workerId: 'arc-operator:restart-worker',
}, dependencies)
assert.equal(recoveryClaim.action.providerTransactionId, '123e4567-e89b-42d3-a456-426614174003')
await completeArcAgreementOperatorAction({
  actionId: requested.id,
  leaseToken: recoveryClaim.leaseToken,
  providerState: 'COMPLETE',
  transactionHash: `0x${'aa'.repeat(32)}`,
  observedBlockNumber: '120',
}, dependencies)
const completed = await readArcAgreementOperatorAction(requested.id, dependencies)
assert.equal(completed.status, 'completed')
assert.equal(completed.attempts, 2)
assert.equal(completed.transactionHash, `0x${'aa'.repeat(32)}`)
assert.deepEqual(await claimArcAgreementOperatorActions({
  workerId: 'arc-operator:post-complete',
}, dependencies), [])

console.log('Arc Agreement durable operator action smoke checks passed.')

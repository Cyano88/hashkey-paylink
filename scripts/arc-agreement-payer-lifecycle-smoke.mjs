import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { encodeFunctionData, parseAbi } from 'viem'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import {
  attachArcAgreementPayerLifecycleChallenge,
  observeArcAgreementPayerLifecycleAction,
  prepareArcAgreementAgentPayerLifecycleCall,
  readArcAgreementPayerLifecycleAction,
  reconcileArcAgreementPayerLifecycleAction,
  recordArcAgreementPayerLifecycleTransaction,
  reserveArcAgreementPayerLifecycleAction,
  reviewArcAgreementPayerLifecycle,
} from '../api/arc-agreement-payer-lifecycle.ts'
import { arcAgreementPayerIdentityHash } from '../api/arc-agreement-activation-attempts.ts'

const partnerId = 'dev_payerlifecycle1234'
const agreementId = 'agr_payerlifecycle1234'
const identity = 'privy:payer-lifecycle-user'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x5555555555555555555555555555555555555555'
const walletId = '123e4567-e89b-42d3-a456-426614174000'
const transactionHash = `0x${'aa'.repeat(32)}`
const entryPoint = '0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789'
const entryPointAbi = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
])
const circleAccountAbi = parseAbi([
  'function execute(address dest,uint256 value,bytes func)',
])
const activationTimestamp = 1_785_240_000
const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:payer-lifecycle-test',
  title: 'Payer lifecycle test',
  description: 'Validate payer cancellation and expiry refund boundaries.',
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
  activationTimestamp,
})
async function snapshot({
  status = 1,
  nextStep = 0,
  releasedAmount = 0n,
  tokenBalance = prepared.totalAmount - releasedAmount,
  head = 100n,
} = {}) {
  return readConfirmedArcAgreementSnapshot({
    getChainId: async () => 5_042_002,
    getBlockNumber: async () => head,
    readContract: async args => {
      if (args.functionName === 'balanceOf') return tokenBalance
      if (args.functionName === 'releaseSchedule') return prepared.cumulativeReleaseBps
      if (args.functionName === 'template') return prepared.templateCode
      if (args.functionName === 'status') return status
      if (args.functionName === 'nextStep') return nextStep
      if (args.functionName === 'releasedAmount') return releasedAmount
      return prepared[args.functionName]
    },
  }, escrow, 5)
}

let durableStore
let bindingCheckoutMode = 'human'
let bindingIdentity = identity
let confirmed = await snapshot()
let blockTimestamp = BigInt(activationTimestamp + 300)
let now = new Date('2026-07-30T10:00:00.000Z')
const queuedWebhookEvents = []
const recordedLifecycleObservations = []
const dependencies = {
  hasStore: () => true,
  read: async () => durableStore,
  mutate: async (_key, update) => {
    durableStore = await update(durableStore)
    return durableStore
  },
  binding: async () => ({
    attemptId: 'aat_payerlifecycle1234',
    partnerId,
    agreementId,
    payerIdentityHash: arcAgreementPayerIdentityHash(bindingIdentity),
    checkoutMode: bindingCheckoutMode,
    escrow,
    prepared,
  }),
  confirmed: async () => confirmed,
  queueWebhook: async event => {
    queuedWebhookEvents.push(event)
    return { event, replayed: queuedWebhookEvents.some(item => item.id === event.id && item !== event) }
  },
  recordObservation: async (recordedPartnerId, recordedAgreementId, observation) => {
    const replayed = recordedLifecycleObservations.some(item => item.observation.eventId === observation.eventId)
    recordedLifecycleObservations.push({ recordedPartnerId, recordedAgreementId, observation })
    return { attempt: {}, replayed }
  },
  now: () => now,
}
let observedTransaction = {
  hash: transactionHash,
  from: payer,
  to: payer,
  input: '0x',
  value: 0n,
}
let receipt = { status: 'success', blockNumber: 105n }
let head = 110n
const client = {
  getChainId: async () => 5_042_002,
  getBlockNumber: async () => head,
  getBlock: async () => ({ timestamp: blockTimestamp }),
  getTransaction: async () => observedTransaction,
  getTransactionReceipt: async () => receipt,
  readContract: async () => undefined,
}

const review = await reviewArcAgreementPayerLifecycle({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
}, dependencies)
assert.equal(review.eligibility.cancel.eligible, true)
assert.equal(review.eligibility.refund.eligible, false)
blockTimestamp = prepared.cancelUntil + 1n
const afterCancellationWindow = await reviewArcAgreementPayerLifecycle({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
}, dependencies)
assert.equal(afterCancellationWindow.eligibility.cancel.eligible, false)
assert.equal(afterCancellationWindow.eligibility.cancel.reason, 'window_closed')
blockTimestamp = BigInt(activationTimestamp + 300)
await assert.rejects(() => reviewArcAgreementPayerLifecycle({
  client,
  partnerId,
  agreementId,
  payerIdentity: 'privy:another-payer-user',
  walletId,
  walletAddress: payer,
}, dependencies), /authenticated agreement payer/)
await assert.rejects(() => reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'cancel',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'false' },
}, dependencies), /disabled/)

const reservation = await reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'cancel',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies)
assert.equal(reservation.replayed, false)
assert.equal(reservation.action.status, 'reserved')
assert.equal(reservation.action.directCall.to, escrow)
assert.equal(reservation.call.to, payer)
assert.match(reservation.action.idempotencyKey, /^[0-9a-f-]{36}$/)
assert.equal((await reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'cancel',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies)).replayed, true)
await assert.rejects(() => reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'refund',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies), /not yet eligible|already bound/)

const attached = await attachArcAgreementPayerLifecycleChallenge({
  partnerId,
  agreementId,
  payerIdentity: identity,
  challengeId: 'challenge_payer_lifecycle_001',
  providerTransactionId: '123e4567-e89b-42d3-a456-426614174003',
}, dependencies)
assert.equal(attached.status, 'transaction_pending')
assert.equal(attached.challengeId, 'challenge_payer_lifecycle_001')

observedTransaction = {
  hash: transactionHash,
  from: '0x9999999999999999999999999999999999999999',
  to: payer,
  input: reservation.call.data,
  value: 0n,
}
const recorded = await recordArcAgreementPayerLifecycleTransaction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  transactionHash,
}, dependencies)
assert.equal(recorded.action.status, 'submitted')
assert.equal(recorded.action.execution, 'circle_smart_wallet')
assert.equal((await recordArcAgreementPayerLifecycleTransaction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  transactionHash,
}, dependencies)).replayed, true)

confirmed = await snapshot({
  status: 3,
  tokenBalance: 0n,
  head: 110n,
})
const reconciled = await reconcileArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
}, dependencies)
assert.equal(reconciled.pending, false)
assert.equal(reconciled.changed, true)
assert.equal(reconciled.action.status, 'confirmed')
assert.equal(reconciled.action.webhookEventId, queuedWebhookEvents[0].id)
assert.equal(queuedWebhookEvents[0].event, 'agreement.cancelled')
assert.equal(recordedLifecycleObservations[0].observation.status, 'cancelled')
assert.equal((await readArcAgreementPayerLifecycleAction({
  partnerId,
  agreementId,
  payerIdentity: identity,
}, dependencies)).observedBlockNumber, '105')

durableStore = undefined
confirmed = await snapshot({
  status: 1,
  nextStep: 1,
  releasedAmount: prepared.totalAmount / 2n,
  tokenBalance: prepared.totalAmount / 2n,
})
blockTimestamp = prepared.expiresAt
const expiredReview = await reviewArcAgreementPayerLifecycle({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
}, dependencies)
assert.equal(expiredReview.eligibility.cancel.eligible, false)
assert.equal(expiredReview.eligibility.cancel.reason, 'release_started')
assert.equal(expiredReview.eligibility.refund.eligible, true)
const refundReservation = await reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'refund',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies)
assert.notEqual(refundReservation.call.data, reservation.call.data)
assert.equal(refundReservation.action.action, 'refund')

await observeArcAgreementPayerLifecycleAction({
  partnerId,
  agreementId,
  payerIdentity: identity,
  status: 'provider_failed',
  providerState: 'FAILED',
}, dependencies)
now = new Date('2026-07-30T10:01:00.000Z')
const retriedRefund = await reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'refund',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies)
assert.equal(retriedRefund.action.sequence, 1)
assert.notEqual(retriedRefund.action.idempotencyKey, refundReservation.action.idempotencyKey)

const badClient = {
  ...client,
  getTransaction: async () => ({
    hash: transactionHash,
    from: payer,
    to: escrow,
    input: '0x1234',
    value: 0n,
  }),
}
await assert.rejects(() => recordArcAgreementPayerLifecycleTransaction({
  client: badClient,
  partnerId,
  agreementId,
  payerIdentity: identity,
  transactionHash,
}, dependencies), /does not match/)

const directTransactionHash = `0x${'bb'.repeat(32)}`
observedTransaction = {
  hash: directTransactionHash,
  from: payer,
  to: escrow,
  input: retriedRefund.action.directCall.data,
  value: 0n,
}
const directRecorded = await recordArcAgreementPayerLifecycleTransaction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  transactionHash: directTransactionHash,
}, dependencies)
assert.equal(directRecorded.action.status, 'submitted')
assert.equal(directRecorded.action.execution, 'direct')

// Circle submits Arc smart-wallet actions through EntryPoint v0.6. A durable
// provider-complete hash must be recoverable without issuing another challenge.
durableStore = undefined
confirmed = await snapshot({
  status: 1,
  releasedAmount: 0n,
  tokenBalance: prepared.totalAmount,
  head: 200n,
})
blockTimestamp = prepared.expiresAt
const userOperationReservation = await reserveArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  walletId,
  walletAddress: payer,
  action: 'refund',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies)
const userOperationHash = `0x${'cc'.repeat(32)}`
const accountCall = (destination, data = userOperationReservation.action.wrappedCall.data) => encodeFunctionData({
  abi: circleAccountAbi,
  functionName: 'execute',
  args: [destination, 0n, data],
})
const entryPointCall = (destination, data) => encodeFunctionData({
  abi: entryPointAbi,
  functionName: 'handleOps',
  args: [[{
    sender: payer,
    nonce: 0n,
    initCode: '0x',
    callData: accountCall(destination, data),
    callGasLimit: 1n,
    verificationGasLimit: 1n,
    preVerificationGas: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    paymasterAndData: '0x',
    signature: '0x',
  }], payer],
})
observedTransaction = {
  hash: userOperationHash,
  from: '0x9999999999999999999999999999999999999999',
  to: entryPoint,
  input: entryPointCall(recipient),
  value: 0n,
}
await assert.rejects(() => recordArcAgreementPayerLifecycleTransaction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
  transactionHash: userOperationHash,
}, dependencies), /does not match/)
await attachArcAgreementPayerLifecycleChallenge({
  partnerId,
  agreementId,
  payerIdentity: identity,
  challengeId: 'challenge_payer_lifecycle_user_op',
  providerTransactionId: '123e4567-e89b-42d3-a456-426614174004',
}, dependencies)
await observeArcAgreementPayerLifecycleAction({
  partnerId,
  agreementId,
  payerIdentity: identity,
  status: 'transaction_pending',
  providerState: 'COMPLETE',
  transactionHash: userOperationHash,
}, dependencies)
observedTransaction = {
  ...observedTransaction,
  input: entryPointCall(
    userOperationReservation.action.directCall.to,
    userOperationReservation.action.directCall.data,
  ),
}
receipt = { status: 'success', blockNumber: 195n }
head = 205n
confirmed = await snapshot({
  status: 4,
  releasedAmount: 0n,
  tokenBalance: 0n,
  head: 200n,
})
const recoveredUserOperation = await reconcileArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
}, dependencies)
assert.equal(recoveredUserOperation.pending, false)
assert.equal(recoveredUserOperation.changed, true)
assert.equal(recoveredUserOperation.action.status, 'confirmed')
assert.equal(recoveredUserOperation.action.execution, 'circle_user_operation')
assert.equal(recoveredUserOperation.action.webhookEventId, queuedWebhookEvents[1].id)
assert.equal(queuedWebhookEvents[1].event, 'agreement.refunded')
assert.equal(recordedLifecycleObservations.at(-1).observation.status, 'refunded')

// Older confirmed actions are backfilled with the same stable terminal event
// without creating or recording another Arc transaction.
delete durableStore.actions[recoveredUserOperation.action.id].webhookEventId
const backfilledUserOperation = await reconcileArcAgreementPayerLifecycleAction({
  client,
  partnerId,
  agreementId,
  payerIdentity: identity,
}, dependencies)
assert.equal(backfilledUserOperation.pending, false)
assert.equal(backfilledUserOperation.changed, true)
assert.equal(backfilledUserOperation.action.status, 'confirmed')
assert.equal(backfilledUserOperation.action.webhookEventId, queuedWebhookEvents[2].id)
assert.equal(queuedWebhookEvents[2].id, queuedWebhookEvents[1].id)

// Agent lifecycle calls use the same verified escrow rules, but the durable
// journal is explicitly agent-direct and rejects Circle smart-wallet execution.
durableStore = undefined
bindingCheckoutMode = 'agentic'
bindingIdentity = `agent:${partnerId}:apr_${'d'.repeat(40)}`
confirmed = await snapshot({ status: 1, releasedAmount: 0n, tokenBalance: prepared.totalAmount, head: 300n })
blockTimestamp = BigInt(activationTimestamp + 300)
const agentReservation = await prepareArcAgreementAgentPayerLifecycleCall({
  client,
  partnerId,
  agreementId,
  payerIdentity: bindingIdentity,
  walletAddress: payer,
  action: 'cancel',
  env: { ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED: 'true' },
}, dependencies)
assert.equal(agentReservation.action.executionMode, 'agent_direct')
assert.equal(agentReservation.call.to, escrow)
assert.equal(agentReservation.call.data, agentReservation.action.directCall.data)

const agentTransactionHash = `0x${'dd'.repeat(32)}`
observedTransaction = {
  hash: agentTransactionHash,
  from: '0x9999999999999999999999999999999999999999',
  to: payer,
  input: agentReservation.action.wrappedCall.data,
  value: 0n,
}
await assert.rejects(() => recordArcAgreementPayerLifecycleTransaction({
  client,
  partnerId,
  agreementId,
  payerIdentity: bindingIdentity,
  transactionHash: agentTransactionHash,
  requireAgentPreparation: true,
  directOnly: true,
}, dependencies), /directly execute/)
observedTransaction = {
  hash: agentTransactionHash,
  from: payer,
  to: escrow,
  input: agentReservation.action.directCall.data,
  value: 0n,
}
const agentRecorded = await recordArcAgreementPayerLifecycleTransaction({
  client,
  partnerId,
  agreementId,
  payerIdentity: bindingIdentity,
  transactionHash: agentTransactionHash,
  requireAgentPreparation: true,
  directOnly: true,
}, dependencies)
assert.equal(agentRecorded.action.execution, 'direct')

const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /^ARC_AGREEMENTS_ENABLED=false$/m)
assert.match(envExample, /^ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED=false$/m)

console.log('Arc Agreement payer cancellation and expiry-refund smoke checks passed.')

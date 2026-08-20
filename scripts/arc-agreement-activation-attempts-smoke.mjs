import assert from 'node:assert/strict'
import {
  encodeFunctionData,
  getAddress,
  parseAbi,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  arcAgreementProjectCapacitySnapshot,
  arcAgreementCircleSmartWalletCall,
  attachArcAgreementPayerChallenge,
  latestArcAgreementPayerChallenge,
  markArcAgreementPayerChallengeRecorded,
  observeArcAgreementPayerChallenge,
  prepareArcAgreementActivationAttempt,
  readArcAgreementActivationAttempt,
  recordArcAgreementLifecycleObservation,
  recordArcAgreementPayerTransaction,
  reconcileArcAgreementActivationAttempt,
  reserveArcAgreementPayerChallenge,
} from '../api/arc-agreement-activation-attempts.ts'
import {
  REVIEWED_ARC_AGREEMENT_FACTORY,
  REVIEWED_ARC_AGREEMENT_OPERATOR,
} from '../api/arc-agreement-activation-policy.ts'
import { ARC_AGREEMENT_NETWORK } from '../api/arc-agreement-config.ts'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'

const partnerId = 'dev_attemptpilot1234'
const agreementId = 'agr_attemptpilot123456'
const payer = getAddress('0x3333333333333333333333333333333333333333')
const recipient = getAddress('0x2222222222222222222222222222222222222222')
const escrow = getAddress('0x4444444444444444444444444444444444444444')
const entryPoint = getAddress('0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789')
const bundler = getAddress('0x6666666666666666666666666666666666666666')
const entryPointAbi = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
])
const circleAccountAbi = parseAbi([
  'function execute(address dest,uint256 value,bytes func)',
])
const chainTerms = arcAgreementTerms({
  template: 'progressive_release',
  externalId: 'attempt-001',
  resourceId: 'content:attempt-test',
  title: 'Activation attempt test',
  description: 'Verify durable payer-owned Arc Agreement activation attempts.',
  amount: '10',
  recipient,
  checkpoints: [{ percentage: 50 }, { percentage: 100 }],
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
})
const draft = {
  clientReference: arcAgreementClientReference(partnerId, agreementId),
  termsHash: chainTerms.termsHash,
  chainTerms,
}
const policy = {
  partnerId,
  merchantName: 'Attempt Pilot',
  allowedOrigins: ['https://pilot.example'],
  defaultNetwork: 'arc',
  paymentOptions: [{ network: 'arc', recipient }],
  settlementMode: 'usdc',
  environment: 'test',
  checkoutMode: 'human',
  capabilities: ['arc_agreements'],
  webhookConfigured: true,
  projectManaged: true,
}
const env = {
  ARC_AGREEMENTS_ENABLED: 'true',
  ARC_AGREEMENT_FACTORY_ADDRESS: REVIEWED_ARC_AGREEMENT_FACTORY,
  ARC_AGREEMENT_OPERATOR_ADDRESS: REVIEWED_ARC_AGREEMENT_OPERATOR,
  ARC_AGREEMENT_OPERATOR_WALLET_ID: 'e3fe3e85-1111-4111-8111-11111111d4d9',
  ARC_AGREEMENT_ALLOWED_PROJECT_IDS: partnerId,
  ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES: 'human',
  ARC_AGREEMENT_MAX_USDC: '25',
  ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3',
  ARC_AGREEMENT_DAILY_VOLUME_USDC: '50',
  ARC_AGREEMENT_MAX_DURATION_SECONDS: '2592000',
  ARC_AGREEMENT_CONFIRMATION_BLOCKS: '5',
  CIRCLE_TEST_API_KEY: 'TEST_API_KEY:test-id:test-secret',
  CIRCLE_ENTITY_SECRET: 'a'.repeat(64),
  PRIVATE_RPC_URL_ARC: 'https://rpc.testnet.arc.network',
}

function memoryDependencies() {
  let store
  let mutationQueue = Promise.resolve()
  let now = new Date('2026-07-29T14:00:00.000Z')
  const webhooks = []
  return {
    dependencies: {
      hasStore: () => true,
      read: async () => store,
      mutate: (_key, update) => {
        const operation = mutationQueue.then(async () => {
          store = await update(store)
          return store
        })
        mutationQueue = operation.then(() => undefined, () => undefined)
        return operation
      },
      queueWebhook: async event => {
        webhooks.push(event)
        return { event, replayed: false }
      },
      now: () => new Date(now),
    },
    advance: milliseconds => { now = new Date(now.getTime() + milliseconds) },
    webhooks,
  }
}

function transactionHash(value) {
  return `0x${value.repeat(64)}`
}

function clientState() {
  const state = {
    head: 100n,
    receipts: new Map(),
    transactions: new Map(),
    allowance: 0n,
    escrow: zeroAddress,
  }
  return {
    state,
    client: {
      getChainId: async () => ARC_AGREEMENT_NETWORK.chainId,
      getBlockNumber: async () => state.head,
      getTransaction: async ({ hash }) => {
        const transaction = state.transactions.get(hash)
        if (!transaction) throw new Error('transaction unavailable')
        return transaction
      },
      getTransactionReceipt: async ({ hash }) => state.receipts.get(hash) ?? null,
      readContract: async ({ address, functionName }) => {
        if (functionName === 'allowance') return state.allowance
        if (functionName === 'agreementEscrow') return state.escrow
        if (address === ARC_AGREEMENT_NETWORK.usdc && functionName === 'balanceOf') return 10_000_000n
        const attempt = state.attempt
        const prepared = attempt.prepared
        const values = {
          agreementId: prepared.agreementId,
          clientReference: prepared.clientReference,
          termsHash: prepared.termsHash,
          factory: prepared.factory,
          payer: prepared.payer,
          recipient: prepared.recipient,
          operator: prepared.operator,
          usdc: prepared.usdc,
          template: prepared.templateCode,
          totalAmount: BigInt(prepared.totalAmount),
          cancelUntil: BigInt(prepared.cancelUntil),
          expiresAt: BigInt(prepared.expiresAt),
          status: 1,
          nextStep: 0,
          releasedAmount: 0n,
          releaseSchedule: prepared.cumulativeReleaseBps,
        }
        if (!(functionName in values)) throw new Error(`unexpected read ${functionName}`)
        return values[functionName]
      },
    },
  }
}

const memory = memoryDependencies()
const chain = clientState()
await assert.rejects(prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft,
  payer,
  payerIdentity: 'privy:test-user-1234',
  payerSource: 'agent_request',
  env,
}, memory.dependencies), /verified Circle Arc payment wallet/)
const relayerKey = `0x${'1'.repeat(64)}`
await assert.rejects(prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft,
  payer: privateKeyToAccount(relayerKey).address,
  payerIdentity: 'privy:test-user-1234',
  payerSource: 'circle_linked_wallet',
  env: { ...env, RELAYER_PRIVATE_KEY_ARC: relayerKey },
}, memory.dependencies), /server relayer/)
const preparedResult = await prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft,
  payer,
  payerIdentity: 'privy:test-user-1234',
  payerSource: 'circle_linked_wallet',
  env,
}, memory.dependencies)

const reservedChallenge = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'approval',
  walletId: 'wallet-test-1234',
  walletAddress: payer,
  env,
}, memory.dependencies)
assert.equal(reservedChallenge.challenge.status, 'reserved')
assert.equal(reservedChallenge.challenge.sequence, 0)
assert.match(reservedChallenge.challenge.idempotencyKey, /^[0-9a-f-]{36}$/)
const replayedReservation = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'approval',
  walletId: 'wallet-test-1234',
  walletAddress: payer,
  env,
}, memory.dependencies)
assert.equal(replayedReservation.replayed, true)
assert.equal(replayedReservation.challenge.idempotencyKey, reservedChallenge.challenge.idempotencyKey)
await assert.rejects(reserveArcAgreementPayerChallenge({
  policy,
  agreementId,
  payerIdentity: 'privy:another-user-9999',
  stage: 'approval',
  walletId: 'wallet-test-1234',
  walletAddress: payer,
  env,
}, memory.dependencies), /another authenticated payer wallet/)
const attachedChallenge = await attachArcAgreementPayerChallenge({
  policy,
  agreementId,
  payerIdentity: 'privy:test-user-1234',
  idempotencyKey: reservedChallenge.challenge.idempotencyKey,
  challengeId: 'challenge-test-1234',
}, memory.dependencies)
assert.equal(attachedChallenge.challenge.status, 'issued')
await assert.rejects(attachArcAgreementPayerChallenge({
  policy,
  agreementId,
  payerIdentity: 'privy:test-user-1234',
  idempotencyKey: reservedChallenge.challenge.idempotencyKey,
  challengeId: 'challenge-different-9999',
}, memory.dependencies), /different challenge/)
const observedChallenge = await observeArcAgreementPayerChallenge({
  policy,
  agreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'approval',
  challengeId: 'challenge-test-1234',
  providerTransactionId: '123e4567-e89b-42d3-a456-426614174002',
  providerState: 'INITIATED',
  status: 'transaction_pending',
}, memory.dependencies)
assert.equal(observedChallenge.providerState, 'INITIATED')
assert.equal(latestArcAgreementPayerChallenge(
  await readArcAgreementActivationAttempt(policy, agreementId, memory.dependencies),
  'approval',
)?.providerTransactionId, '123e4567-e89b-42d3-a456-426614174002')
assert.equal(preparedResult.replayed, false)
assert.equal(preparedResult.attempt.status, 'awaiting_approval')
assert.equal(preparedResult.attempt.prepared.totalAmount, '10000000')
assert.equal(preparedResult.attempt.calls.approval.to, ARC_AGREEMENT_NETWORK.usdc)
assert.equal(preparedResult.attempt.calls.activation.to, REVIEWED_ARC_AGREEMENT_FACTORY)
assert.equal(preparedResult.attempt.calls.approval.value, '0')
assert.equal(preparedResult.attempt.calls.activation.value, '0')
assert.equal(preparedResult.attempt.activationTimestamp, 1_785_333_600)
chain.state.attempt = preparedResult.attempt

memory.advance(60_000)
const replay = await prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft,
  payer,
  payerIdentity: 'privy:test-user-1234',
  payerSource: 'circle_linked_wallet',
  env,
}, memory.dependencies)
assert.equal(replay.replayed, true)
assert.equal(replay.attempt.id, preparedResult.attempt.id)
await assert.rejects(prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft,
  payer,
  payerIdentity: 'privy:different-user-5678',
  payerSource: 'circle_linked_wallet',
  env,
}, memory.dependencies), /different durable activation commitment/)
await assert.rejects(prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft: { ...draft, termsHash: `0x${'f'.repeat(64)}` },
  payer,
  payerIdentity: 'privy:test-user-1234',
  payerSource: 'circle_linked_wallet',
  env,
}, memory.dependencies), /different durable activation commitment/)

const approvalHash = transactionHash('1')
chain.state.transactions.set(approvalHash, {
  hash: approvalHash,
  from: payer,
  to: preparedResult.attempt.calls.approval.to,
  input: preparedResult.attempt.calls.approval.data,
  value: 0n,
})
const approvalSmartWalletCall = arcAgreementCircleSmartWalletCall(
  preparedResult.attempt,
  'approval',
)
const circleApprovalCall = encodeFunctionData({
  abi: circleAccountAbi,
  functionName: 'execute',
  args: [
    preparedResult.attempt.calls.approval.to,
    0n,
    preparedResult.attempt.calls.approval.data,
  ],
})
const approvalUserOperationData = encodeFunctionData({
  abi: entryPointAbi,
  functionName: 'handleOps',
  args: [[{
    sender: payer,
    nonce: 1n,
    initCode: '0x',
    callData: circleApprovalCall,
    callGasLimit: 200_000n,
    verificationGasLimit: 200_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    paymasterAndData: '0x',
    signature: '0x',
  }], bundler],
})
const approvalUserOperationHash = transactionHash('c')
chain.state.transactions.set(approvalUserOperationHash, {
  hash: approvalUserOperationHash,
  from: bundler,
  to: entryPoint,
  input: approvalUserOperationData,
  value: 0n,
})
const tamperedHash = transactionHash('a')
chain.state.transactions.set(tamperedHash, {
  hash: tamperedHash,
  from: payer,
  to: preparedResult.attempt.calls.approval.to,
  input: preparedResult.attempt.calls.activation.data,
  value: 0n,
})
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'approval',
  transactionHash: tamperedHash,
  env,
}, memory.dependencies), /does not match the prepared direct, Circle smart-wallet, or Circle user-operation call/)
const valueHash = transactionHash('b')
chain.state.transactions.set(valueHash, {
  hash: valueHash,
  from: payer,
  to: preparedResult.attempt.calls.approval.to,
  input: preparedResult.attempt.calls.approval.data,
  value: 1n,
})
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'approval',
  transactionHash: valueHash,
  env,
}, memory.dependencies), /must not transfer native value/)
const tamperedUserOperationHash = transactionHash('d')
const tamperedCircleCall = encodeFunctionData({
  abi: circleAccountAbi,
  functionName: 'execute',
  args: [recipient, 0n, approvalSmartWalletCall.data],
})
chain.state.transactions.set(tamperedUserOperationHash, {
  hash: tamperedUserOperationHash,
  from: bundler,
  to: entryPoint,
  input: encodeFunctionData({
    abi: entryPointAbi,
    functionName: 'handleOps',
    args: [[{
      sender: payer,
      nonce: 2n,
      initCode: '0x',
      callData: tamperedCircleCall,
      callGasLimit: 200_000n,
      verificationGasLimit: 200_000n,
      preVerificationGas: 50_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      paymasterAndData: '0x',
      signature: '0x',
    }], bundler],
  }),
  value: 0n,
})
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'approval',
  transactionHash: tamperedUserOperationHash,
  env,
}, memory.dependencies), /does not match the prepared direct, Circle smart-wallet, or Circle user-operation call/)
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer: recipient,
  stage: 'approval',
  transactionHash: approvalHash,
  env,
}, memory.dependencies), /prepared agreement payer/)

await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'approval',
  transactionHash: approvalHash,
  env: { ...env, ARC_AGREEMENTS_ENABLED: 'false' },
}, memory.dependencies), /activation is disabled/)

const submittedApproval = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'approval',
  transactionHash: approvalUserOperationHash,
  directOnly: true,
  env,
}, memory.dependencies)
assert.equal(submittedApproval.attempt.status, 'approval_submitted')
assert.equal(submittedApproval.replayed, false)
assert.equal(submittedApproval.attempt.transactions[0].execution, 'circle_user_operation')
const recordedChallenge = await markArcAgreementPayerChallengeRecorded({
  policy,
  agreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'approval',
  challengeId: 'challenge-test-1234',
  transactionHash: approvalUserOperationHash,
}, memory.dependencies)
assert.equal(recordedChallenge.status, 'recorded')
assert.equal(recordedChallenge.transactionHash, approvalUserOperationHash)
assert.equal((await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'approval',
  transactionHash: approvalUserOperationHash,
  env,
}, memory.dependencies)).replayed, true)

await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'activation',
  transactionHash: transactionHash('2'),
  env,
}, memory.dependencies), /transaction unavailable|before payer approval/)

assert.equal((await reconcileArcAgreementActivationAttempt({
  client: chain.client,
  policy,
  agreementId,
  confirmationBlocks: 5,
}, memory.dependencies)).pending, true)
chain.state.receipts.set(approvalUserOperationHash, { status: 'success', blockNumber: 99n })
assert.equal((await reconcileArcAgreementActivationAttempt({
  client: chain.client,
  policy,
  agreementId,
  confirmationBlocks: 5,
}, memory.dependencies)).pending, true)
chain.state.head = 104n
chain.state.allowance = 10_000_000n
const confirmedApproval = await reconcileArcAgreementActivationAttempt({
  client: chain.client,
  policy,
  agreementId,
  confirmationBlocks: 5,
}, memory.dependencies)
assert.equal(confirmedApproval.attempt.status, 'ready_to_activate')
assert.equal(confirmedApproval.attempt.transactions[0].status, 'confirmed')

const activationHash = transactionHash('2')
chain.state.transactions.set(activationHash, {
  hash: activationHash,
  from: payer,
  to: preparedResult.attempt.calls.activation.to,
  input: preparedResult.attempt.calls.activation.data,
  value: 0n,
})
const submittedActivation = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'activation',
  transactionHash: activationHash,
  env,
}, memory.dependencies)
assert.equal(submittedActivation.attempt.status, 'activation_submitted')

const replacementHash = transactionHash('3')
chain.state.transactions.set(replacementHash, {
  hash: replacementHash,
  from: payer,
  to: preparedResult.attempt.calls.activation.to,
  input: preparedResult.attempt.calls.activation.data,
  value: 0n,
})
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId,
  payer,
  stage: 'activation',
  transactionHash: replacementHash,
  env,
}, memory.dependencies), /already awaiting authoritative Arc reconciliation/)

chain.state.receipts.set(activationHash, { status: 'success', blockNumber: 104n })
chain.state.head = 109n
chain.state.escrow = escrow
const queueWebhook = memory.dependencies.queueWebhook
memory.dependencies.queueWebhook = async () => {
  throw new Error('durable webhook unavailable')
}
await assert.rejects(reconcileArcAgreementActivationAttempt({
  client: chain.client,
  policy,
  agreementId,
  confirmationBlocks: 5,
}, memory.dependencies), /durable webhook unavailable/)
assert.equal((await readArcAgreementActivationAttempt(
  policy,
  agreementId,
  memory.dependencies,
)).status, 'activation_submitted')
memory.dependencies.queueWebhook = queueWebhook
const active = await reconcileArcAgreementActivationAttempt({
  client: chain.client,
  policy,
  agreementId,
  confirmationBlocks: 5,
}, memory.dependencies)
assert.equal(active.attempt.status, 'active')
assert.equal(active.attempt.escrow, escrow)
assert.match(active.attempt.activationWebhookEventId, /^evt_[a-f0-9]{24}$/)
assert.equal(active.reconciliation.verified, true)
assert.equal(active.reconciliation.lifecycle, 'active')
assert.equal(memory.webhooks.length, 1)
assert.equal(memory.webhooks[0].event, 'agreement.activated')
assert.equal(memory.webhooks[0].observedBlockNumber, '104')
assert.equal((await readArcAgreementActivationAttempt(policy, agreementId, memory.dependencies)).status, 'active')

const otherPolicy = { ...policy, partnerId: 'dev_otherattempt1234' }
await assert.rejects(readArcAgreementActivationAttempt(
  otherPolicy,
  agreementId,
  memory.dependencies,
), /not found for this project/)

const secondAgreementId = 'agr_attemptpilot654321'
const secondTerms = arcAgreementTerms({
  template: 'fixed_unlock',
  externalId: 'attempt-002',
  resourceId: 'content:attempt-retry',
  title: 'Activation retry test',
  description: 'Verify reverted transactions and cross-attempt replay protection.',
  amount: '10',
  recipient,
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
})
const secondPrepared = await prepareArcAgreementActivationAttempt({
  policy,
  agreementId: secondAgreementId,
  draft: {
    clientReference: arcAgreementClientReference(partnerId, secondAgreementId),
    termsHash: secondTerms.termsHash,
    chainTerms: secondTerms,
  },
  payer,
  payerIdentity: 'privy:test-user-1234',
  payerSource: 'circle_linked_wallet',
  env,
}, memory.dependencies)
assert.equal(secondPrepared.attempt.calls.approval.data, preparedResult.attempt.calls.approval.data)
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  payer,
  stage: 'approval',
  transactionHash: approvalUserOperationHash,
  env,
}, memory.dependencies), /already bound to another activation action/)

const revertedHash = transactionHash('4')
const secondSmartWalletApproval = arcAgreementCircleSmartWalletCall(secondPrepared.attempt, 'approval')
chain.state.transactions.set(revertedHash, {
  hash: revertedHash,
  from: getAddress('0x5555555555555555555555555555555555555555'),
  to: secondSmartWalletApproval.to,
  input: secondSmartWalletApproval.data,
  value: 0n,
})
const wrappedApproval = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  payer,
  stage: 'approval',
  transactionHash: revertedHash,
  env,
}, memory.dependencies)
assert.equal(wrappedApproval.attempt.transactions.at(-1).execution, 'circle_smart_wallet')
chain.state.receipts.set(revertedHash, { status: 'reverted', blockNumber: 109n })
chain.state.head = 114n
const reverted = await reconcileArcAgreementActivationAttempt({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  confirmationBlocks: 5,
}, memory.dependencies)
assert.equal(reverted.attempt.status, 'approval_failed')
assert.equal(reverted.attempt.transactions.at(-1).failure, 'transaction_reverted')

const retryHash = transactionHash('5')
chain.state.transactions.set(retryHash, {
  hash: retryHash,
  from: payer,
  to: secondPrepared.attempt.calls.approval.to,
  input: secondPrepared.attempt.calls.approval.data,
  value: 0n,
})
const retried = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  payer,
  stage: 'approval',
  transactionHash: retryHash,
  env,
}, memory.dependencies)
assert.equal(retried.attempt.status, 'approval_submitted')
assert.equal(retried.attempt.transactions.length, 2)

await memory.dependencies.mutate('ignored', store => {
  store.attempts[secondPrepared.attempt.id].status = 'ready_to_activate'
  return store
})
const secondActivationHash = transactionHash('6')
chain.state.transactions.set(secondActivationHash, {
  hash: secondActivationHash,
  from: payer,
  to: secondPrepared.attempt.calls.activation.to,
  input: secondPrepared.attempt.calls.activation.data,
  value: 0n,
})
await assert.rejects(reserveArcAgreementPayerChallenge({
  policy,
  agreementId: secondAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-capacity-wallet',
  walletAddress: payer,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
}, memory.dependencies), /active Arc Agreement limit/)
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  payer,
  stage: 'activation',
  transactionHash: secondActivationHash,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
}, memory.dependencies), /active Arc Agreement limit/)

await memory.dependencies.mutate('ignored', store => {
  store.attempts[preparedResult.attempt.id].lifecycle = {
    status: 'completed',
    nextStep: 2,
    releasedAmountUsdcUnits: '10000000',
    obligationAmountUsdcUnits: '0',
    excessAmountUsdcUnits: '0',
    observedBlockNumber: '110',
    observedBlockTimestamp: '2026-07-29T14:01:00.000Z',
    eventId: `evt_${'a'.repeat(24)}`,
    observedAt: '2026-07-29T14:01:00.000Z',
  }
  return store
})
const reservedSecondCapacity = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId: secondAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-capacity-wallet',
  walletAddress: payer,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
}, memory.dependencies)
assert.equal(reservedSecondCapacity.attempt.capacityReservation.amountUsdcUnits, '10000000')
const admittedSecondActivation = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  payer,
  stage: 'activation',
  transactionHash: secondActivationHash,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
}, memory.dependencies)
assert.equal(admittedSecondActivation.attempt.status, 'activation_submitted')
assert.equal((await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: secondAgreementId,
  payer,
  stage: 'activation',
  transactionHash: secondActivationHash,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
}, memory.dependencies)).replayed, true)

async function prepareReadyAgreement(id, externalId) {
  const agreementTerms = arcAgreementTerms({
    template: 'fixed_unlock',
    externalId,
    resourceId: `content:${externalId}`,
    title: `Capacity test ${externalId}`,
    description: 'Verify atomic project capacity admission and UTC daily rollover.',
    amount: '10',
    recipient,
    durationSeconds: 86_400,
    cancellationWindowSeconds: 900,
  })
  const prepared = await prepareArcAgreementActivationAttempt({
    policy,
    agreementId: id,
    draft: {
      clientReference: arcAgreementClientReference(partnerId, id),
      termsHash: agreementTerms.termsHash,
      chainTerms: agreementTerms,
    },
    payer,
    payerIdentity: 'privy:test-user-1234',
    payerSource: 'circle_linked_wallet',
    env,
  }, memory.dependencies)
  await memory.dependencies.mutate('ignored', store => {
    store.attempts[prepared.attempt.id].status = 'ready_to_activate'
    return store
  })
  return prepared.attempt
}

const thirdAgreementId = 'agr_capacitydaily12345'
const thirdAttempt = await prepareReadyAgreement(thirdAgreementId, 'capacity-daily')
const thirdActivationHash = transactionHash('7')
chain.state.transactions.set(thirdActivationHash, {
  hash: thirdActivationHash,
  from: payer,
  to: thirdAttempt.calls.activation.to,
  input: thirdAttempt.calls.activation.data,
  value: 0n,
})
await assert.rejects(reserveArcAgreementPayerChallenge({
  policy,
  agreementId: thirdAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-daily-wallet',
  walletAddress: payer,
  env: {
    ...env,
    ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3',
    ARC_AGREEMENT_DAILY_VOLUME_USDC: '15',
  },
}, memory.dependencies), /daily-volume limit/)
await assert.rejects(recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: thirdAgreementId,
  payer,
  stage: 'activation',
  transactionHash: thirdActivationHash,
  env: {
    ...env,
    ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3',
    ARC_AGREEMENT_DAILY_VOLUME_USDC: '15',
  },
}, memory.dependencies), /daily-volume limit/)

memory.advance(10 * 60 * 60 * 1_000)
const reservedAfterRollover = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId: thirdAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-daily-wallet',
  walletAddress: payer,
  env: {
    ...env,
    ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3',
    ARC_AGREEMENT_DAILY_VOLUME_USDC: '15',
  },
}, memory.dependencies)
assert.equal(reservedAfterRollover.attempt.capacityReservation.utcDay, '2026-07-30')
chain.state.transactions.set(thirdActivationHash, {
  hash: thirdActivationHash,
  from: payer,
  to: reservedAfterRollover.attempt.calls.activation.to,
  input: reservedAfterRollover.attempt.calls.activation.data,
  value: 0n,
})
const admittedAfterRollover = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy,
  agreementId: thirdAgreementId,
  payer,
  stage: 'activation',
  transactionHash: thirdActivationHash,
  env: {
    ...env,
    ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3',
    ARC_AGREEMENT_DAILY_VOLUME_USDC: '15',
  },
}, memory.dependencies)
assert.equal(admittedAfterRollover.attempt.status, 'activation_submitted')

await memory.dependencies.mutate('ignored', store => {
  for (const id of [secondPrepared.attempt.id, thirdAttempt.id]) {
    store.attempts[id].status = 'active'
    store.attempts[id].lifecycle = {
      status: 'completed',
      nextStep: 1,
      releasedAmountUsdcUnits: '10000000',
      obligationAmountUsdcUnits: '0',
      excessAmountUsdcUnits: '0',
      observedBlockNumber: '120',
      observedBlockTimestamp: '2026-07-30T00:01:00.000Z',
      eventId: `evt_${(id.endsWith('1') ? 'b' : 'c').repeat(24)}`,
      observedAt: '2026-07-30T00:01:00.000Z',
    }
  }
  return store
})

const fourthAgreementId = 'agr_capacityatomic1234'
const fifthAgreementId = 'agr_capacityatomic5678'
const fourthAttempt = await prepareReadyAgreement(fourthAgreementId, 'capacity-atomic-a')
const fifthAttempt = await prepareReadyAgreement(fifthAgreementId, 'capacity-atomic-b')
const fourthHash = transactionHash('8')
const fifthHash = transactionHash('9')
chain.state.transactions.set(fourthHash, {
  hash: fourthHash,
  from: payer,
  to: fourthAttempt.calls.activation.to,
  input: fourthAttempt.calls.activation.data,
  value: 0n,
})
chain.state.transactions.set(fifthHash, {
  hash: fifthHash,
  from: payer,
  to: fifthAttempt.calls.activation.to,
  input: fifthAttempt.calls.activation.data,
  value: 0n,
})
const concurrentReservations = await Promise.allSettled([
  reserveArcAgreementPayerChallenge({
    policy,
    agreementId: fourthAgreementId,
    payerIdentity: 'privy:test-user-1234',
    stage: 'activation',
    walletId: 'circle-atomic-wallet',
    walletAddress: payer,
    env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
  }, memory.dependencies),
  reserveArcAgreementPayerChallenge({
    policy,
    agreementId: fifthAgreementId,
    payerIdentity: 'privy:test-user-1234',
    stage: 'activation',
    walletId: 'circle-atomic-wallet',
    walletAddress: payer,
    env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
  }, memory.dependencies),
])
assert.equal(concurrentReservations.filter(result => result.status === 'fulfilled').length, 1)
assert.equal(concurrentReservations.filter(result => result.status === 'rejected').length, 1)
assert.match(
  concurrentReservations.find(result => result.status === 'rejected').reason.message,
  /active Arc Agreement limit/,
)
const concurrentAdmissions = await Promise.allSettled([
  recordArcAgreementPayerTransaction({
    client: chain.client,
    policy,
    agreementId: fourthAgreementId,
    payer,
    stage: 'activation',
    transactionHash: fourthHash,
    env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
  }, memory.dependencies),
  recordArcAgreementPayerTransaction({
    client: chain.client,
    policy,
    agreementId: fifthAgreementId,
    payer,
    stage: 'activation',
    transactionHash: fifthHash,
    env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1' },
  }, memory.dependencies),
])
assert.equal(concurrentAdmissions.filter(result => result.status === 'fulfilled').length, 1)
assert.equal(concurrentAdmissions.filter(result => result.status === 'rejected').length, 1)
assert.match(
  concurrentAdmissions.find(result => result.status === 'rejected').reason.message,
  /active Arc Agreement limit/,
)

const revertedActivationAttempt = {
  ...fourthAttempt,
  status: 'activation_failed',
  transactions: [{
    hash: transactionHash('d'),
    stage: 'activation',
    status: 'failed',
    execution: 'direct',
    submittedAt: '2026-07-30T00:02:00.000Z',
    failure: 'transaction_reverted',
  }],
}
assert.deepEqual(arcAgreementProjectCapacitySnapshot({
  attempts: [revertedActivationAttempt],
  partnerId,
  utcDay: '2026-07-30',
}), { activeAgreements: 0, dailyVolumeUsdcUnits: 0n })
assert.deepEqual(arcAgreementProjectCapacitySnapshot({
  attempts: [{
    ...revertedActivationAttempt,
    status: 'reconciliation_failed',
    transactions: [{
      ...revertedActivationAttempt.transactions[0],
      failure: 'escrow_mismatch',
    }],
  }],
  partnerId,
  utcDay: '2026-07-30',
}), { activeAgreements: 1, dailyVolumeUsdcUnits: 10_000_000n })

const sixthAgreementId = 'agr_capacityrelease1234'
await prepareReadyAgreement(sixthAgreementId, 'capacity-release')
const sixthReservation = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId: sixthAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-release-wallet',
  walletAddress: payer,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3' },
}, memory.dependencies)
await attachArcAgreementPayerChallenge({
  policy,
  agreementId: sixthAgreementId,
  payerIdentity: 'privy:test-user-1234',
  idempotencyKey: sixthReservation.challenge.idempotencyKey,
  challengeId: 'challenge-capacity-release',
}, memory.dependencies)
await observeArcAgreementPayerChallenge({
  policy,
  agreementId: sixthAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  challengeId: 'challenge-capacity-release',
  providerState: 'CANCELLED',
  status: 'provider_failed',
}, memory.dependencies)
assert.equal((await readArcAgreementActivationAttempt(
  policy,
  sixthAgreementId,
  memory.dependencies,
)).capacityReservation, undefined)

const seventhAgreementId = 'agr_capacityambiguous12'
await prepareReadyAgreement(seventhAgreementId, 'capacity-ambiguous')
const seventhReservation = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId: seventhAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-ambiguous-wallet',
  walletAddress: payer,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3' },
}, memory.dependencies)
await attachArcAgreementPayerChallenge({
  policy,
  agreementId: seventhAgreementId,
  payerIdentity: 'privy:test-user-1234',
  idempotencyKey: seventhReservation.challenge.idempotencyKey,
  challengeId: 'challenge-capacity-ambiguous',
  providerTransactionId: '11111111-1111-4111-8111-111111111111',
}, memory.dependencies)
await observeArcAgreementPayerChallenge({
  policy,
  agreementId: seventhAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  challengeId: 'challenge-capacity-ambiguous',
  providerTransactionId: '11111111-1111-4111-8111-111111111111',
  providerState: 'FAILED',
  status: 'provider_failed',
}, memory.dependencies)
assert.equal((await readArcAgreementActivationAttempt(
  policy,
  seventhAgreementId,
  memory.dependencies,
)).capacityReservation.amountUsdcUnits, '10000000')
const staleActivationTimestamp = seventhReservation.attempt.activationTimestamp
const staleDeploymentHash = seventhReservation.attempt.prepared.deploymentHash
memory.advance(2 * 60 * 60 * 1_000)
const seventhRetry = await reserveArcAgreementPayerChallenge({
  policy,
  agreementId: seventhAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  walletId: 'circle-ambiguous-wallet',
  walletAddress: payer,
  env: { ...env, ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '3' },
}, memory.dependencies)
assert.equal(seventhRetry.replayed, false)
assert.equal(seventhRetry.challenge.sequence, 1)
assert.notEqual(seventhRetry.challenge.idempotencyKey, seventhReservation.challenge.idempotencyKey)
assert.equal(seventhRetry.attempt.activationTimestamp, staleActivationTimestamp + (2 * 60 * 60))
assert.notEqual(seventhRetry.attempt.prepared.deploymentHash, staleDeploymentHash)
assert.equal(
  BigInt(seventhRetry.attempt.prepared.cancelUntil),
  BigInt(seventhRetry.attempt.activationTimestamp + 900),
)
assert.equal(
  BigInt(seventhRetry.attempt.prepared.expiresAt),
  BigInt(seventhRetry.attempt.activationTimestamp + 86_400),
)
assert.equal(
  seventhRetry.attempt.calls.approval.data,
  seventhReservation.attempt.calls.approval.data,
)
assert.equal((await readArcAgreementActivationAttempt(
  policy,
  seventhAgreementId,
  memory.dependencies,
)).capacityReservation.amountUsdcUnits, '10000000')

// Recover a Circle user operation that executed the prior immutable activation
// commitment even though the attempt was renewed before its hash was recorded.
const driftedActivationHash = transactionHash('e')
const driftedCircleCall = encodeFunctionData({
  abi: circleAccountAbi,
  functionName: 'execute',
  args: [
    seventhReservation.attempt.calls.activation.to,
    0n,
    seventhReservation.attempt.calls.activation.data,
  ],
})
chain.state.transactions.set(driftedActivationHash, {
  hash: driftedActivationHash,
  from: bundler,
  to: entryPoint,
  input: encodeFunctionData({
    abi: entryPointAbi,
    functionName: 'handleOps',
    args: [[{
      sender: payer,
      nonce: 3n,
      initCode: '0x',
      callData: driftedCircleCall,
      callGasLimit: 200_000n,
      verificationGasLimit: 200_000n,
      preVerificationGas: 50_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      paymasterAndData: '0x',
      signature: '0x',
    }], bundler],
  }),
  value: 0n,
})
await attachArcAgreementPayerChallenge({
  policy,
  agreementId: seventhAgreementId,
  payerIdentity: 'privy:test-user-1234',
  idempotencyKey: seventhRetry.challenge.idempotencyKey,
  challengeId: 'challenge-drift-recovery',
  providerTransactionId: '22222222-2222-4222-8222-222222222222',
}, memory.dependencies)
await observeArcAgreementPayerChallenge({
  policy,
  agreementId: seventhAgreementId,
  payerIdentity: 'privy:test-user-1234',
  stage: 'activation',
  challengeId: 'challenge-drift-recovery',
  providerTransactionId: '22222222-2222-4222-8222-222222222222',
  transactionHash: driftedActivationHash,
  providerState: 'COMPLETE',
  status: 'transaction_pending',
}, memory.dependencies)
const recoveredDrift = await recordArcAgreementPayerTransaction({
  client: chain.client,
  policy: { partnerId },
  agreementId: seventhAgreementId,
  payer,
  stage: 'activation',
  transactionHash: driftedActivationHash,
  recoverSubmittedChallenge: true,
  env: { ...env, ARC_AGREEMENTS_ENABLED: 'false' },
}, memory.dependencies)
assert.equal(recoveredDrift.attempt.status, 'activation_submitted')
assert.equal(recoveredDrift.attempt.activationTimestamp, staleActivationTimestamp)
assert.equal(recoveredDrift.attempt.prepared.deploymentHash, staleDeploymentHash)
assert.equal(recoveredDrift.attempt.transactions.at(-1).execution, 'circle_user_operation')

await memory.dependencies.mutate('ignored', store => {
  store.attempts[recoveredDrift.attempt.id].status = 'active'
  return store
})

const capacityStoreBeforeTerminal = await memory.dependencies.read()
const capacityBeforeTerminal = arcAgreementProjectCapacitySnapshot({
  attempts: Object.values(capacityStoreBeforeTerminal.attempts),
  partnerId,
  utcDay: '2026-07-30',
})
const terminalObservation = await recordArcAgreementLifecycleObservation(partnerId, seventhAgreementId, {
  status: 'refunded',
  nextStep: 0,
  releasedAmountUsdcUnits: '0',
  obligationAmountUsdcUnits: '0',
  excessAmountUsdcUnits: '0',
  observedBlockNumber: '200',
  observedBlockTimestamp: '2026-07-29T15:00:00.000Z',
  eventId: 'evt_terminalcapacity1234',
  observedAt: '2026-07-29T15:00:01.000Z',
}, memory.dependencies)
assert.equal(terminalObservation.attempt.lifecycle.status, 'refunded')
assert.equal(terminalObservation.replayed, false)
assert.equal((await recordArcAgreementLifecycleObservation(partnerId, seventhAgreementId, {
  ...terminalObservation.attempt.lifecycle,
}, memory.dependencies)).replayed, true)
const finalStore = await memory.dependencies.read()
const capacityAfterTerminal = arcAgreementProjectCapacitySnapshot({
  attempts: Object.values(finalStore.attempts),
  partnerId,
  utcDay: '2026-07-30',
})
assert.equal(capacityAfterTerminal.activeAgreements, capacityBeforeTerminal.activeAgreements - 1)

console.log('Arc Agreement durable activation-attempt smoke checks passed.')

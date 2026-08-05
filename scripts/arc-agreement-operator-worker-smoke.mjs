import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { encodeFunctionData, parseAbi } from 'viem'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import { prepareArcAgreementReleaseCall } from '../api/arc-agreement-operator.ts'
import { fetchAndVerifyArcAgreementOperatorWallet } from '../api/arc-agreement-operator-wallet.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import { drainArcAgreementOperatorActions } from '../api/arc-agreement-operator-worker.ts'
import {
  ArcAgreementOperatorProviderError,
  createArcAgreementOperatorClient,
} from '../api/arc-agreement-operator-client.ts'

const partnerId = 'dev_operatorworker1234'
const agreementId = 'agr_operatorworker1234'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x5555555555555555555555555555555555555555'
const walletId = '123e4567-e89b-42d3-a456-426614174000'
const idempotencyKey = '123e4567-e89b-42d3-b456-426614174001'
const transactionId = '123e4567-e89b-42d3-a456-426614174003'
const transactionHash = `0x${'aa'.repeat(32)}`
const userOperationTransactionHash = `0x${'bb'.repeat(32)}`
const evidenceHash = `0x${'11'.repeat(32)}`
const entryPoint = '0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789'
const bundler = '0x6666666666666666666666666666666666666666'
const entryPointAbi = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
])
const circleAccountAbi = parseAbi([
  'function execute(address dest,uint256 value,bytes func)',
])
const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:operator-worker-test',
  title: 'Operator worker test',
  description: 'Validate the disabled, reviewed, restart-safe operator worker.',
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
async function confirmed(nextStep, status, releasedAmount, tokenBalance, blockNumber = 100n) {
  return readConfirmedArcAgreementSnapshot({
    getChainId: async () => 5_042_002,
    getBlockNumber: async () => blockNumber,
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
const before = await confirmed(0, 1, 0n, prepared.totalAmount)
const after = await confirmed(1, 1, prepared.totalAmount / 2n, prepared.totalAmount / 2n, 120n)
const operatorWallet = await fetchAndVerifyArcAgreementOperatorWallet({
  apiKey: 'TEST_API_KEY:operator-worker',
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
  confirmed: before,
  step: 0,
  evidenceHash,
})
const baseAction = {
  id: 'opa_1234567890abcdef12345678',
  partnerId,
  agreementId,
  action: 'release',
  step: 0,
  evidenceHash,
  evidenceReference: 'case/operator-worker-001',
  requestHash: '1'.repeat(64),
  idempotencyKey,
  requestedBy: 'operations.requester',
  requestedAt: '2026-07-30T10:00:00.000Z',
  reviewedBy: 'operations.reviewer',
  reviewedAt: '2026-07-30T10:01:00.000Z',
  reviewNote: 'Evidence verified against the delivery record.',
  status: 'queued',
  attempts: 1,
  preparedCall: {
    walletId: call.walletId,
    operatorAddress: call.operatorAddress,
    contractAddress: call.contractAddress,
    abiFunctionSignature: call.abiFunctionSignature,
    abiParameters: [...call.abiParameters],
    refId: call.refId,
  },
  updatedAt: '2026-07-30T10:01:00.000Z',
}
const binding = async () => ({
  attemptId: 'aat_operatorworker1234',
  partnerId,
  agreementId,
  escrow,
  prepared,
})
const disabled = await drainArcAgreementOperatorActions({
  enabled: () => false,
  claim: async () => { throw new Error('disabled worker claimed work') },
})
assert.deepEqual(disabled, {
  enabled: false,
  claimed: 0,
  submitted: 0,
  pending: 0,
  completed: 0,
  failed: 0,
})

let recorded
let submittedCall
const submissionResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: baseAction, leaseToken: 'lease-submit' }],
  binding,
  confirmed: async () => before,
  recordSubmission: async input => { recorded = input },
  reschedule: async () => undefined,
  complete: async () => undefined,
  fail: async input => { throw input.error },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async preparedCall => {
      submittedCall = preparedCall
      return transactionId
    },
    status: async () => { throw new Error('status should not run in submission pass') },
  }),
  chainClient: () => ({
    getBlock: async () => ({ timestamp: 1_785_240_100n }),
  }),
})
assert.equal(submissionResult.submitted, 1)
assert.equal(submittedCall.refId, call.refId)
assert.equal(recorded.providerTransactionId, transactionId)

const expectedInput = encodeFunctionData({
  abi: parseAbi(['function releaseStep(uint8 step,bytes32 evidenceHash)']),
  functionName: 'releaseStep',
  args: [0, evidenceHash],
})
const circleAccountCall = (destination, data) => encodeFunctionData({
  abi: circleAccountAbi,
  functionName: 'execute',
  args: [destination, 0n, data],
})
const circleUserOperation = (sender, destination, data) => encodeFunctionData({
  abi: entryPointAbi,
  functionName: 'handleOps',
  args: [[{
    sender,
    nonce: 1n,
    initCode: '0x',
    callData: circleAccountCall(destination, data),
    callGasLimit: 100_000n,
    verificationGasLimit: 100_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    paymasterAndData: '0x',
    signature: '0x1234',
  }], bundler],
})
let completed
const recoveryAction = {
  ...baseAction,
  status: 'provider_pending',
  providerTransactionId: transactionId,
  attempts: 2,
}
const completionResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: recoveryAction, leaseToken: 'lease-recovery' }],
  binding,
  confirmed: async () => after,
  recordSubmission: async () => { throw new Error('recovery resubmitted transaction') },
  reschedule: async () => undefined,
  complete: async input => { completed = input },
  fail: async input => { throw input.error },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async () => { throw new Error('recovery resubmitted transaction') },
    status: async () => ({
      verified: true,
      transactionId,
      circleState: 'COMPLETE',
      classification: 'chain_reconciliation_required',
      txHash: transactionHash,
      blockHeight: 110,
      authoritativeAgreementState: false,
      requiresConfirmedChainReconciliation: true,
    }),
  }),
  chainClient: () => ({
    getTransaction: async () => ({
      hash: transactionHash,
      from: operator,
      to: escrow,
      input: expectedInput,
      value: 0n,
    }),
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 110n }),
  }),
})
assert.equal(completionResult.completed, 1)
assert.equal(completed.transactionHash, transactionHash)
assert.equal(completed.observedBlockNumber, '115')

let userOperationCompleted
const userOperationCompletionResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: recoveryAction, leaseToken: 'lease-user-operation' }],
  binding,
  confirmed: async () => after,
  recordSubmission: async () => { throw new Error('user operation recovery resubmitted transaction') },
  reschedule: async () => undefined,
  complete: async input => { userOperationCompleted = input },
  fail: async input => { throw input.error },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async () => { throw new Error('user operation recovery resubmitted transaction') },
    status: async () => ({
      verified: true,
      transactionId,
      circleState: 'COMPLETE',
      classification: 'chain_reconciliation_required',
      txHash: userOperationTransactionHash,
      blockHeight: 110,
      authoritativeAgreementState: false,
      requiresConfirmedChainReconciliation: true,
    }),
  }),
  chainClient: () => ({
    getTransaction: async () => ({
      hash: userOperationTransactionHash,
      from: bundler,
      to: entryPoint,
      input: circleUserOperation(operator, escrow, expectedInput),
      value: 0n,
    }),
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 110n }),
  }),
})
assert.equal(userOperationCompletionResult.completed, 1)
assert.equal(userOperationCompleted.transactionHash, userOperationTransactionHash)

let rejectedUserOperationError
const rejectedUserOperationResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: recoveryAction, leaseToken: 'lease-wrong-user-operation-target' }],
  binding,
  confirmed: async () => after,
  recordSubmission: async () => undefined,
  reschedule: async () => undefined,
  complete: async () => undefined,
  fail: async input => { rejectedUserOperationError = input.error },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async () => { throw new Error('rejected user operation resubmitted transaction') },
    status: async () => ({
      verified: true,
      transactionId,
      circleState: 'COMPLETE',
      classification: 'chain_reconciliation_required',
      txHash: userOperationTransactionHash,
      blockHeight: 110,
      authoritativeAgreementState: false,
      requiresConfirmedChainReconciliation: true,
    }),
  }),
  chainClient: () => ({
    getTransaction: async () => ({
      hash: userOperationTransactionHash,
      from: bundler,
      to: entryPoint,
      input: circleUserOperation(operator, recipient, expectedInput),
      value: 0n,
    }),
  }),
})
assert.equal(rejectedUserOperationResult.failed, 1)
assert.match(rejectedUserOperationError.message, /does not match the reviewed contract execution/)

let rescheduled
const pendingResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: recoveryAction, leaseToken: 'lease-pending' }],
  binding,
  confirmed: async () => before,
  recordSubmission: async () => { throw new Error('pending transaction resubmitted') },
  reschedule: async input => { rescheduled = input },
  complete: async () => undefined,
  fail: async input => { throw input.error },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async () => { throw new Error('pending transaction resubmitted') },
    status: async () => ({
      verified: true,
      transactionId,
      circleState: 'INITIATED',
      classification: 'pending',
      txHash: null,
      blockHeight: null,
      authoritativeAgreementState: false,
      requiresConfirmedChainReconciliation: false,
    }),
  }),
  chainClient: () => ({}),
})
assert.equal(pendingResult.pending, 1)
assert.equal(rescheduled.status, 'provider_pending')
assert.equal(rescheduled.providerState, 'INITIATED')

let manualReview
const tampered = {
  ...recoveryAction,
  preparedCall: {
    ...recoveryAction.preparedCall,
    abiParameters: [0, `0x${'ff'.repeat(32)}`],
  },
}
const tamperResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: tampered, leaseToken: 'lease-tampered' }],
  binding,
  confirmed: async () => after,
  recordSubmission: async () => undefined,
  reschedule: async () => undefined,
  complete: async () => undefined,
  fail: async input => { manualReview = input.manualReview },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async () => transactionId,
    status: async () => { throw new Error('tampered action reached provider') },
  }),
  chainClient: () => ({}),
})
assert.equal(tamperResult.failed, 1)
assert.equal(manualReview, true)

let expiredDefinitive
const expiredResult = await drainArcAgreementOperatorActions({
  enabled: () => true,
  claim: async () => [{ action: baseAction, leaseToken: 'lease-expired' }],
  binding,
  confirmed: async () => before,
  recordSubmission: async () => undefined,
  reschedule: async () => undefined,
  complete: async () => undefined,
  fail: async input => { expiredDefinitive = input.definitive },
  operatorClient: () => ({
    operatorWallet: async () => operatorWallet,
    submit: async () => { throw new Error('expired release reached provider') },
    status: async () => { throw new Error('expired release reached provider') },
  }),
  chainClient: () => ({
    getBlock: async () => ({ timestamp: before.snapshot.expiresAt }),
  }),
})
assert.equal(expiredResult.failed, 1)
assert.equal(expiredDefinitive, true)

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const providerRequests = []
const providerClient = createArcAgreementOperatorClient({
  apiKey: 'TEST_API_KEY:operator-worker:secret',
  entitySecret: 'ab'.repeat(32),
  operatorWalletId: walletId,
  fetchImpl: async (url, init) => {
    providerRequests.push({ url: String(url), init })
    if (String(url).endsWith('/v1/w3s/config/entity/publicKey')) {
      return new Response(JSON.stringify({ data: { publicKey: publicKeyPem } }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: { id: transactionId } }), { status: 200 })
  },
})
assert.equal(await providerClient.submit(call), transactionId)
const submittedBody = JSON.parse(providerRequests[1].init.body)
assert.equal(submittedBody.idempotencyKey, idempotencyKey)
assert.equal(submittedBody.walletId, walletId)
assert.equal(submittedBody.blockchain, 'ARC-TESTNET')
assert.equal(submittedBody.contractAddress, escrow)
assert.equal(submittedBody.abiFunctionSignature, 'releaseStep(uint8,bytes32)')
assert.deepEqual(submittedBody.abiParameters, ['0', evidenceHash])
assert.equal('entitySecretCiphertext' in submittedBody, true)
assert.equal(JSON.stringify(submittedBody).includes('ab'.repeat(32)), false)

async function rejectedProvider(status) {
  const client = createArcAgreementOperatorClient({
    apiKey: 'TEST_API_KEY:operator-worker:secret',
    entitySecret: 'ab'.repeat(32),
    operatorWalletId: walletId,
    fetchImpl: async url => String(url).endsWith('/v1/w3s/config/entity/publicKey')
      ? new Response(JSON.stringify({ data: { publicKey: publicKeyPem } }), { status: 200 })
      : new Response(JSON.stringify({ code: 'probe', message: 'provider response' }), { status }),
  })
  try {
    await client.submit(call)
    assert.fail(`Expected Circle HTTP ${status} to fail.`)
  } catch (error) {
    assert.ok(error instanceof ArcAgreementOperatorProviderError)
    return error
  }
}
assert.equal((await rejectedProvider(400)).definitive, true)
assert.equal((await rejectedProvider(403)).manualReview, true)
const ambiguous = await rejectedProvider(500)
assert.equal(ambiguous.definitive, false)
assert.equal(ambiguous.manualReview, false)
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(envExample, /^ARC_AGREEMENTS_ENABLED=false$/m)
assert.match(envExample, /^ARC_AGREEMENT_OPERATOR_WORKER_ENABLED=false$/m)
assert.match(serverSource, /drainArcAgreementOperatorActions/)

console.log('Arc Agreement operator worker smoke checks passed.')

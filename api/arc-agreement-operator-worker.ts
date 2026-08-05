import { randomUUID } from 'node:crypto'
import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  parseAbi,
  type Hex,
} from 'viem'
import {
  claimArcAgreementOperatorActions,
  completeArcAgreementOperatorAction,
  failArcAgreementOperatorAction,
  recordArcAgreementOperatorSubmission,
  rescheduleArcAgreementOperatorAction,
  type ArcAgreementOperatorActionClaim,
} from './arc-agreement-operator-actions.js'
import { readArcAgreementActivationBinding } from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import { readConfirmedArcAgreementSnapshot } from './arc-agreement-confirmed-snapshot.js'
import {
  ArcAgreementOperatorProviderError,
  createArcAgreementOperatorClient,
  type ArcAgreementOperatorClient,
} from './arc-agreement-operator-client.js'
import {
  prepareArcAgreementCancellationCall,
  prepareArcAgreementReleaseCall,
  restoreArcAgreementOperatorCallForStatus,
  type ArcAgreementPreparedOperatorCall,
} from './arc-agreement-operator.js'
import { reconcileArcAgreementSnapshot } from './arc-agreement-reconciliation.js'

const operatorAbi = parseAbi([
  'function releaseStep(uint8 step,bytes32 evidenceHash)',
  'function cancelByOperator(bytes32 reasonHash)',
])
const entryPointV06Abi = parseAbi([
  'function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops,address payable beneficiary)',
])
const circleAccountAbi = parseAbi([
  'function execute(address dest,uint256 value,bytes func)',
])
const ENTRY_POINT_V06 = getAddress('0x5FF137D4b0FDcd49DCa30c7CF57E578a026d2789')

type ChainClient = ReturnType<typeof createArcAgreementActivationClient>

type WorkerDependencies = {
  enabled: () => boolean
  claim: (input: {
    workerId: string
    maxAttempts?: number
    leaseMs?: number
  }) => Promise<ArcAgreementOperatorActionClaim[]>
  binding: typeof readArcAgreementActivationBinding
  confirmed: typeof readConfirmedArcAgreementSnapshot
  recordSubmission: typeof recordArcAgreementOperatorSubmission
  reschedule: typeof rescheduleArcAgreementOperatorAction
  complete: typeof completeArcAgreementOperatorAction
  fail: typeof failArcAgreementOperatorAction
  operatorClient: () => ArcAgreementOperatorClient
  chainClient: () => ChainClient
}

const workerId = `arc-operator:${randomUUID()}`
let drainInFlight = false

const defaults: WorkerDependencies = {
  enabled: () => String(process.env.ARC_AGREEMENT_OPERATOR_WORKER_ENABLED ?? '').trim().toLowerCase() === 'true',
  claim: claimArcAgreementOperatorActions,
  binding: readArcAgreementActivationBinding,
  confirmed: readConfirmedArcAgreementSnapshot,
  recordSubmission: recordArcAgreementOperatorSubmission,
  reschedule: rescheduleArcAgreementOperatorAction,
  complete: completeArcAgreementOperatorAction,
  fail: failArcAgreementOperatorAction,
  operatorClient: createArcAgreementOperatorClient,
  chainClient: createArcAgreementActivationClient,
}

function preparedCallFor(
  claim: ArcAgreementOperatorActionClaim,
  input: {
    operatorWallet: Awaited<ReturnType<ArcAgreementOperatorClient['operatorWallet']>>
    prepared: Awaited<ReturnType<typeof readArcAgreementActivationBinding>>['prepared']
    confirmed: Awaited<ReturnType<typeof readConfirmedArcAgreementSnapshot>>
  },
) {
  const action = claim.action
  if (action.action === 'release') {
    return prepareArcAgreementReleaseCall({
      operatorWallet: input.operatorWallet,
      idempotencyKey: action.idempotencyKey,
      partnerId: action.partnerId,
      agreementId: action.agreementId,
      prepared: input.prepared,
      confirmed: input.confirmed,
      step: action.step!,
      evidenceHash: action.evidenceHash,
    })
  }
  return prepareArcAgreementCancellationCall({
    operatorWallet: input.operatorWallet,
    idempotencyKey: action.idempotencyKey,
    partnerId: action.partnerId,
    agreementId: action.agreementId,
    prepared: input.prepared,
    confirmed: input.confirmed,
    reasonHash: action.evidenceHash,
  })
}

function expectedCallData(call: ArcAgreementPreparedOperatorCall) {
  return encodeFunctionData({
    abi: operatorAbi,
    functionName: call.abiFunctionSignature.startsWith('releaseStep')
      ? 'releaseStep'
      : 'cancelByOperator',
    args: call.abiParameters as [number, Hex] | [Hex],
  })
}

function matchesConfirmedExecution(
  transaction: Awaited<ReturnType<ChainClient['getTransaction']>>,
  call: ArcAgreementPreparedOperatorCall,
) {
  if (transaction.value !== 0n) return false
  const expected = expectedCallData(call).toLowerCase()
  const direct = (
    getAddress(transaction.from) === call.operatorAddress
    && transaction.to !== null
    && getAddress(transaction.to) === call.contractAddress
    && transaction.input.toLowerCase() === expected
  )
  if (direct) return true
  if (transaction.to === null || getAddress(transaction.to) !== ENTRY_POINT_V06) return false
  try {
    const entryPointCall = decodeFunctionData({
      abi: entryPointV06Abi,
      data: transaction.input,
    })
    if (entryPointCall.functionName !== 'handleOps') return false
    const [operations] = entryPointCall.args
    if (operations.length !== 1) return false
    const operation = operations[0]
    if (getAddress(operation.sender) !== call.operatorAddress) return false
    const accountCall = decodeFunctionData({
      abi: circleAccountAbi,
      data: operation.callData,
    })
    if (accountCall.functionName !== 'execute') return false
    const [destination, value, callData] = accountCall.args
    return (
      value === 0n
      && getAddress(destination) === call.contractAddress
      && callData.toLowerCase() === expected
    )
  } catch {
    return false
  }
}

async function assertConfirmedExecution(input: {
  chain: ChainClient
  claim: ArcAgreementOperatorActionClaim
  call: ArcAgreementPreparedOperatorCall
  transactionHash: Hex
  confirmed: Awaited<ReturnType<typeof readConfirmedArcAgreementSnapshot>>
}) {
  const transaction = await input.chain.getTransaction({ hash: input.transactionHash })
  if (!matchesConfirmedExecution(transaction, input.call)) {
    throw new Error('Confirmed Arc operator transaction does not match the reviewed contract execution.')
  }
  const receipt = await input.chain.getTransactionReceipt({ hash: input.transactionHash })
  if (!receipt) return false
  if (receipt.status !== 'success') throw new Error('Confirmed Arc operator transaction reverted.')
  if (receipt.blockNumber > input.confirmed.observedBlockNumber) return false

  const snapshot = input.confirmed.snapshot
  if (input.claim.action.action === 'release') {
    const expectedNextStep = input.claim.action.step! + 1
    if (snapshot.nextStep < expectedNextStep || ![1, 2].includes(snapshot.status)) return false
  } else if (snapshot.status !== 3) {
    return false
  }
  return true
}

async function processClaim(
  claim: ArcAgreementOperatorActionClaim,
  dependencies: WorkerDependencies,
  operator: ArcAgreementOperatorClient,
  chain: ChainClient,
) {
  const binding = await dependencies.binding(claim.action.partnerId, claim.action.agreementId)
  const persistedParameters = claim.action.preparedCall.abiParameters
  const persistedMatchesReview = claim.action.action === 'release'
    ? (
        claim.action.preparedCall.abiFunctionSignature === 'releaseStep(uint8,bytes32)'
        && persistedParameters.length === 2
        && persistedParameters[0] === claim.action.step
        && String(persistedParameters[1]).toLowerCase() === claim.action.evidenceHash.toLowerCase()
      )
    : (
        claim.action.preparedCall.abiFunctionSignature === 'cancelByOperator(bytes32)'
        && persistedParameters.length === 1
        && String(persistedParameters[0]).toLowerCase() === claim.action.evidenceHash.toLowerCase()
      )
  if (!persistedMatchesReview) {
    throw new ArcAgreementOperatorProviderError(
      'Durable operator call no longer matches the reviewed evidence.',
      { manualReview: true },
    )
  }
  const confirmed = await dependencies.confirmed(chain, binding.escrow)
  const reconciliation = reconcileArcAgreementSnapshot(binding.prepared, confirmed.snapshot)
  if (!reconciliation.verified) {
    throw new Error(`Operator action blocked by reconciliation: ${reconciliation.mismatches.join(', ')}.`)
  }
  if (!claim.action.providerTransactionId && confirmed.snapshot.status !== 1) {
    throw new ArcAgreementOperatorProviderError(
      'Reviewed operator action is no longer valid because the agreement is terminal.',
      { definitive: true },
    )
  }
  if (
    !claim.action.providerTransactionId
    && claim.action.action === 'release'
    && confirmed.snapshot.nextStep !== claim.action.step
  ) {
    throw new ArcAgreementOperatorProviderError(
      'Reviewed release no longer matches the confirmed next agreement step.',
      { manualReview: true },
    )
  }
  if (!claim.action.providerTransactionId && claim.action.action === 'release') {
    const block = await chain.getBlock({ blockNumber: confirmed.observedBlockNumber })
    if (block.timestamp >= confirmed.snapshot.expiresAt) {
      throw new ArcAgreementOperatorProviderError(
        'Reviewed release is expired at the confirmed Arc block boundary.',
        { definitive: true },
      )
    }
  }
  const operatorWallet = await operator.operatorWallet(confirmed.snapshot.operator)
  const call = claim.action.providerTransactionId
    ? restoreArcAgreementOperatorCallForStatus({
        operatorWallet,
        partnerId: claim.action.partnerId,
        agreementId: claim.action.agreementId,
        prepared: binding.prepared,
        confirmed,
        persistedCall: {
          idempotencyKey: claim.action.idempotencyKey,
          ...claim.action.preparedCall,
        },
      })
    : preparedCallFor(claim, {
        operatorWallet,
        prepared: binding.prepared,
        confirmed,
      })

  if (!claim.action.providerTransactionId) {
    const providerTransactionId = await operator.submit(call)
    await dependencies.recordSubmission({
      actionId: claim.action.id,
      leaseToken: claim.leaseToken,
      providerTransactionId,
    })
    return 'submitted' as const
  }

  const status = await operator.status(claim.action.providerTransactionId, call)
  if (status.classification === 'failed') {
    await dependencies.fail({
      actionId: claim.action.id,
      leaseToken: claim.leaseToken,
      error: new Error(`Circle operator transaction failed in state ${status.circleState}.`),
      definitive: true,
    })
    return 'failed' as const
  }
  if (status.classification === 'manual_review') {
    await dependencies.fail({
      actionId: claim.action.id,
      leaseToken: claim.leaseToken,
      error: new Error(`Circle operator transaction requires review in state ${status.circleState}.`),
      manualReview: true,
    })
    return 'failed' as const
  }
  if (status.classification === 'pending' || !status.txHash) {
    await dependencies.reschedule({
      actionId: claim.action.id,
      leaseToken: claim.leaseToken,
      status: 'provider_pending',
      providerState: status.circleState,
      retryAfterMs: 10_000,
    })
    return 'pending' as const
  }

  const after = await dependencies.confirmed(chain, binding.escrow)
  const afterReconciliation = reconcileArcAgreementSnapshot(binding.prepared, after.snapshot)
  if (!afterReconciliation.verified) {
    throw new Error(`Operator result blocked by reconciliation: ${afterReconciliation.mismatches.join(', ')}.`)
  }
  const completed = await assertConfirmedExecution({
    chain,
    claim,
    call,
    transactionHash: status.txHash,
    confirmed: after,
  })
  if (!completed) {
    await dependencies.reschedule({
      actionId: claim.action.id,
      leaseToken: claim.leaseToken,
      status: 'chain_pending',
      providerState: status.circleState,
      transactionHash: status.txHash,
      retryAfterMs: 10_000,
    })
    return 'pending' as const
  }
  await dependencies.complete({
    actionId: claim.action.id,
    leaseToken: claim.leaseToken,
    providerState: status.circleState,
    transactionHash: status.txHash,
    observedBlockNumber: after.observedBlockNumber.toString(),
  })
  return 'completed' as const
}

export async function drainArcAgreementOperatorActions(
  dependencies: WorkerDependencies = defaults,
) {
  const enabled = dependencies.enabled()
  if (!enabled || drainInFlight) {
    return { enabled, claimed: 0, submitted: 0, pending: 0, completed: 0, failed: 0 }
  }
  drainInFlight = true
  try {
    const claims = await dependencies.claim({ workerId, maxAttempts: 10, leaseMs: 60_000 })
    if (claims.length === 0) {
      return { enabled: true, claimed: 0, submitted: 0, pending: 0, completed: 0, failed: 0 }
    }
    let operator: ArcAgreementOperatorClient
    let chain: ChainClient
    try {
      operator = dependencies.operatorClient()
      chain = dependencies.chainClient()
    } catch (error) {
      for (const claim of claims) {
        await dependencies.fail({
          actionId: claim.action.id,
          leaseToken: claim.leaseToken,
          error,
          manualReview: true,
        })
      }
      return {
        enabled: true,
        claimed: claims.length,
        submitted: 0,
        pending: 0,
        completed: 0,
        failed: claims.length,
      }
    }

    let submitted = 0
    let pending = 0
    let completed = 0
    let failed = 0
    for (const claim of claims) {
      try {
        const result = await processClaim(claim, dependencies, operator, chain)
        if (result === 'submitted') submitted += 1
        else if (result === 'completed') completed += 1
        else if (result === 'pending') pending += 1
        else failed += 1
      } catch (error) {
        failed += 1
        const providerError = error instanceof ArcAgreementOperatorProviderError ? error : null
        await dependencies.fail({
          actionId: claim.action.id,
          leaseToken: claim.leaseToken,
          error,
          definitive: providerError?.definitive,
          manualReview: providerError?.manualReview || (!providerError && claim.action.attempts >= 10),
        })
      }
    }
    return { enabled: true, claimed: claims.length, submitted, pending, completed, failed }
  } finally {
    drainInFlight = false
  }
}

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { encodeFunctionData, getAddress, parseAbi } from 'viem'
import { createArcAgreementAgentHandler } from '../api/arc-agreement-agent.ts'
import {
  arcAgreementPayerIdentityHash,
  prepareArcAgreementActivationAttempt,
  prepareArcAgreementAgentPayerCall,
  recordArcAgreementPayerTransaction,
} from '../api/arc-agreement-activation-attempts.ts'
import {
  REVIEWED_ARC_AGREEMENT_FACTORY,
  REVIEWED_ARC_AGREEMENT_OPERATOR,
} from '../api/arc-agreement-activation-policy.ts'
import { ARC_AGREEMENT_NETWORK } from '../api/arc-agreement-config.ts'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, body, method = 'POST') {
  const response = responseRecorder()
  const idempotencySuffix = [body?.action, body?.stage, body?.lifecycleAction].filter(Boolean).join('-') || 'request'
  await handler({
    method,
    body,
    headers: {
      'x-api-key': 'hpl_test_agent_mock',
      'idempotency-key': `arc-agent-smoke-${idempotencySuffix}-001`,
    },
  }, response)
  return response
}

const partnerId = 'dev_agentactivate1234'
const agreementId = 'agr_agentactivate123456'
const payer = getAddress('0x3333333333333333333333333333333333333333')
const recipient = getAddress('0x2222222222222222222222222222222222222222')
const payerReference = `apr_${'a'.repeat(40)}`
const identity = `agent:${partnerId}:${payerReference}`
const executionAbi = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function cancelByPayer()',
])
const policy = {
  partnerId,
  ownerId: 'did:privy:agent-project-owner',
  ownerEmail: 'agent-owner@example.com',
  merchantName: 'Agent Agreement Pilot',
  allowedOrigins: ['https://hashpaystream.app'],
  defaultNetwork: 'arc',
  paymentOptions: [{ network: 'arc', recipient }],
  settlementMode: 'usdc',
  environment: 'test',
  checkoutMode: 'agentic',
  capabilities: ['arc_agreements'],
  webhookConfigured: true,
  projectManaged: true,
}
const chainTerms = arcAgreementTerms({
  template: 'fixed_unlock',
  externalId: 'agent-activation-001',
  resourceId: 'agent-task:research-001',
  title: 'Agent research delivery',
  description: 'Deliver a reviewed research report for an autonomous buyer.',
  amount: '1',
  recipient,
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
})
const agreement = {
  id: agreementId,
  partnerId,
  checkoutMode: 'agentic',
  environment: 'test',
  network: 'arc',
  template: 'fixed_unlock',
  externalId: 'agent-activation-001',
  resourceId: 'agent-task:research-001',
  title: 'Agent research delivery',
  description: 'Deliver a reviewed research report for an autonomous buyer.',
  amount: '1',
  recipient,
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
  termsHash: chainTerms.termsHash,
  clientReference: arcAgreementClientReference(partnerId, agreementId),
  chainTerms,
  status: 'draft',
  activationStatus: 'private_pilot',
  requestHash: 'private-request-hash',
  payerAccessHash: '',
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
}
const attempt = {
  id: 'aat_agentactivate12345678',
  partnerId,
  agreementId,
  payerIdentityHash: arcAgreementPayerIdentityHash(identity),
  checkoutMode: 'agentic',
  status: 'awaiting_approval',
  authorization: {
    authorized: true,
    partnerId,
    checkoutMode: 'agentic',
    amountCeilingUsdcUnits: '1000000',
    dailyVolumeCeilingUsdcUnits: '1000000',
    activeAgreementLimit: 1,
    durationCeilingSeconds: 604800,
    factory: REVIEWED_ARC_AGREEMENT_FACTORY,
    operator: REVIEWED_ARC_AGREEMENT_OPERATOR,
    confirmationBlocks: 5,
  },
  prepared: {
    chainId: 5_042_002,
    agreementId: `0x${'1'.repeat(64)}`,
    deploymentHash: `0x${'2'.repeat(64)}`,
    clientReference: agreement.clientReference,
    termsHash: agreement.termsHash,
    factory: REVIEWED_ARC_AGREEMENT_FACTORY,
    payer,
    recipient,
    operator: REVIEWED_ARC_AGREEMENT_OPERATOR,
    usdc: ARC_AGREEMENT_NETWORK.usdc,
    templateCode: 0,
    totalAmount: '1000000',
    cancelUntil: '1785845700',
    expiresAt: '1785931200',
    cumulativeReleaseBps: [10_000],
  },
  calls: {
    approval: {
      chainId: 5_042_002,
      to: ARC_AGREEMENT_NETWORK.usdc,
      data: encodeFunctionData({
        abi: executionAbi,
        functionName: 'approve',
        args: [REVIEWED_ARC_AGREEMENT_FACTORY, 1_000_000n],
      }),
      value: '0',
    },
    activation: { chainId: 5_042_002, to: REVIEWED_ARC_AGREEMENT_FACTORY, data: '0x5678', value: '0' },
  },
  transactions: [],
  agentCallPreparations: [],
  activationTimestamp: 1_785_844_800,
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
}

let currentPolicy = policy
let currentAttempt = attempt
let preparedInput
let callInput
let recordInput
let lifecyclePrepareInput
let lifecycleRecordInput
let deliveryDecisionInput
let circleExecutionInput
let circleExecutionCount = 0
const executionRecords = []
const delivery = {
  id: `opa_${'1'.repeat(24)}`,
  partnerId,
  agreementId,
  action: 'release',
  step: 0,
  evidenceHash: `0x${'4'.repeat(64)}`,
  evidenceReference: 'ipfs://agent-delivery-evidence',
  deliveryNote: 'Agent completed the requested research delivery.',
  reviewPolicy: 'payer',
  requestHash: '5'.repeat(64),
  requestedBy: 'did:privy:provider-agent',
  requestedAt: agreement.createdAt,
  status: 'awaiting_review',
  updatedAt: agreement.updatedAt,
}
const activeAttempt = {
  ...attempt,
  status: 'active',
  escrow: getAddress('0x4444444444444444444444444444444444444444'),
  lifecycle: { status: 'active', nextStep: 0 },
}
const handler = createArcAgreementAgentHandler({
  policy: async () => currentPolicy,
  readAgreement: async (project, id) => project === partnerId && id === agreementId ? agreement : null,
  prepareAttempt: async input => {
    preparedInput = input
    currentAttempt = attempt
    return { attempt, replayed: false }
  },
  readAttempt: async () => currentAttempt,
  prepareCall: async input => {
    callInput = input
    return {
      attempt: currentAttempt,
      preparation: { stage: input.stage, sequence: 0, deploymentHash: attempt.prepared.deploymentHash, preparedAt: agreement.createdAt },
      call: attempt.calls[input.stage],
      replayed: false,
    }
  },
  recordTransaction: async input => {
    recordInput = input
    currentAttempt = { ...currentAttempt, status: input.stage === 'approval' ? 'approval_submitted' : 'activation_submitted' }
    return { attempt: currentAttempt, replayed: false }
  },
  reconcileAttempt: async () => ({ attempt: currentAttempt, pending: true, changed: false }),
  reviewLifecycle: async input => ({
    binding: { checkoutMode: 'agentic' },
    confirmed: {},
    observedBlockTimestamp: 0n,
    eligibility: { cancel: { eligible: true, reason: null }, refund: { eligible: false, reason: 'not_expired' } },
    action: null,
    input,
  }),
  prepareLifecycleCall: async input => {
    lifecyclePrepareInput = input
    return {
      action: { action: input.action, status: 'reserved' },
      call: {
        chainId: 5_042_002,
        to: activeAttempt.escrow,
        data: encodeFunctionData({ abi: executionAbi, functionName: 'cancelByPayer' }),
        value: '0',
      },
      replayed: false,
    }
  },
  recordLifecycleTransaction: async input => {
    lifecycleRecordInput = input
    return { action: { action: 'cancel', status: 'submitted' }, replayed: false }
  },
  reconcileLifecycle: async () => ({ action: { action: 'cancel', status: 'submitted' }, pending: true, changed: false }),
  listOperatorActions: async () => currentAttempt.status === 'active' ? [delivery] : [],
  approveOperatorAction: async input => {
    deliveryDecisionInput = input
    return { ...delivery, status: 'queued', reviewedBy: input.reviewedBy }
  },
  disputeOperatorAction: async input => ({ ...delivery, status: 'disputed', reviewedBy: input.reviewedBy }),
  readCircleLink: async () => null,
  readAgentWallet: async () => ({
    walletAddress: payer,
    chain: 'ARC-TESTNET',
    sessionId: 'circle-session',
    updatedAt: Date.now(),
    source: 'store',
  }),
  executeCircleCall: async input => {
    circleExecutionInput = input
    circleExecutionCount += 1
    return {
      transactionHash: `0x${'6'.repeat(64)}`,
      providerTransactionId: 'circle-transaction-id',
      providerState: 'CONFIRMED',
    }
  },
  claimExecution: async input => {
    const existing = executionRecords.find(record => (
      record.ownerId === input.ownerId
      && record.idempotencyKey === input.idempotencyKey
      && record.action === input.action
    ))
    if (existing) return { record: existing, claimed: false }
    const executionRecord = {
      id: 'journal-entry',
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      status: 'started',
      metadata: input.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    executionRecords.push(executionRecord)
    return { record: executionRecord, claimed: true }
  },
  recordExecution: async input => {
    const index = executionRecords.findIndex(record => (
      record.ownerId === input.ownerId
      && record.idempotencyKey === input.idempotencyKey
      && record.action === input.action
    ))
    const executionRecord = { ...executionRecords[index], ...input, updatedAt: Date.now() }
    if (index >= 0) executionRecords[index] = executionRecord
    else executionRecords.push(executionRecord)
    return executionRecord
  },
  client: () => ({}),
  env: () => ({}),
  logError: () => undefined,
})

const prepared = await request(handler, { action: 'prepare', agreementId, payerReference, payerAddress: payer })
assert.equal(prepared.statusCode, 201)
assert.equal(prepared.body.agreement.checkoutMode, 'agentic')
assert.equal('requestHash' in prepared.body.agreement, false)
assert.equal('payerAccessHash' in prepared.body.agreement, false)
assert.equal('payerIdentityHash' in prepared.body.attempt, false)
assert.equal('calls' in prepared.body.attempt, false)
assert.equal(preparedInput.payerIdentity, identity)

const preparedCall = await request(handler, {
  action: 'prepare-call', agreementId, payerReference, payerAddress: payer, stage: 'approval',
})
assert.equal(preparedCall.statusCode, 200)
assert.equal(preparedCall.body.call.to, ARC_AGREEMENT_NETWORK.usdc)
assert.equal(callInput.payerIdentity, identity)

currentAttempt = attempt
const circleExecuted = await request(handler, {
  action: 'circle-execute', agreementId, payerReference, payerAddress: payer, stage: 'approval',
})
assert.equal(circleExecuted.statusCode, 202)
assert.equal(circleExecuted.body.transactionHash, `0x${'6'.repeat(64)}`)
assert.equal(circleExecutionInput.agentSlug, 'wallet-jk3rxh')
assert.equal(circleExecutionInput.walletAddress, payer)
assert.equal(circleExecutionInput.contractAddress, ARC_AGREEMENT_NETWORK.usdc)
assert.equal(circleExecutionInput.abiFunctionSignature, 'approve(address,uint256)')
assert.deepEqual(circleExecutionInput.abiParameters, [REVIEWED_ARC_AGREEMENT_FACTORY, '1000000'])
assert.equal(circleExecutionCount, 1)
assert.equal(recordInput.requireAgentPreparation, true)
assert.equal(recordInput.directOnly, true)

currentAttempt = attempt
const replayedCircleExecution = await request(handler, {
  action: 'circle-execute', agreementId, payerReference, payerAddress: payer, stage: 'approval',
})
assert.equal(replayedCircleExecution.statusCode, 202)
assert.equal(replayedCircleExecution.body.replayed, true)
assert.equal(circleExecutionCount, 1)

currentAttempt = attempt
const recorded = await request(handler, {
  action: 'record', agreementId, payerReference, payerAddress: payer, stage: 'approval', transactionHash: `0x${'9'.repeat(64)}`,
})
assert.equal(recorded.statusCode, 202)
assert.equal(recordInput.requireAgentPreparation, true)
assert.equal(recordInput.directOnly, true)
assert.equal(recordInput.payerIdentity, identity)

currentAttempt = activeAttempt
const reviewedLifecycle = await request(handler, { action: 'review', agreementId, payerReference, payerAddress: payer })
assert.equal(reviewedLifecycle.statusCode, 200)
assert.equal(reviewedLifecycle.body.delivery.id, delivery.id)
assert.equal(reviewedLifecycle.body.lifecycle.cancel.eligible, true)

const acceptedDelivery = await request(handler, {
  action: 'delivery-decision', agreementId, payerReference, payerAddress: payer, deliveryId: delivery.id, decision: 'accept',
})
assert.equal(acceptedDelivery.statusCode, 200)
assert.equal(acceptedDelivery.body.delivery.status, 'queued')
assert.equal(deliveryDecisionInput.requesterReviewAuthorized, true)
assert.equal(deliveryDecisionInput.authoritativeNextStep, 0)

const lifecycleCall = await request(handler, {
  action: 'lifecycle-prepare-call', agreementId, payerReference, payerAddress: payer, lifecycleAction: 'cancel',
})
assert.equal(lifecycleCall.statusCode, 200)
assert.equal(lifecycleCall.body.call.to, activeAttempt.escrow)
assert.equal(lifecyclePrepareInput.payerIdentity, identity)

const lifecycleCircleExecuted = await request(handler, {
  action: 'lifecycle-circle-execute',
  agreementId,
  payerReference,
  payerAddress: payer,
  lifecycleAction: 'cancel',
})
assert.equal(lifecycleCircleExecuted.statusCode, 202)
assert.equal(circleExecutionInput.contractAddress, activeAttempt.escrow)
assert.equal(circleExecutionInput.abiFunctionSignature, 'cancelByPayer()')
assert.deepEqual(circleExecutionInput.abiParameters, [])
assert.equal(lifecycleRecordInput.requireAgentPreparation, true)
assert.equal(lifecycleRecordInput.directOnly, true)

const lifecycleRecorded = await request(handler, {
  action: 'lifecycle-record', agreementId, payerReference, payerAddress: payer, transactionHash: `0x${'7'.repeat(64)}`,
})
assert.equal(lifecycleRecorded.statusCode, 202)
assert.equal(lifecycleRecordInput.requireAgentPreparation, true)
assert.equal(lifecycleRecordInput.directOnly, true)

const lifecycleStatus = await request(handler, {
  action: 'lifecycle-status', agreementId, payerReference, payerAddress: payer,
})
assert.equal(lifecycleStatus.statusCode, 200)
assert.equal(lifecycleStatus.body.pending, true)

const foreignReference = await request(handler, {
  action: 'review', agreementId, payerReference: `apr_${'b'.repeat(40)}`, payerAddress: payer,
})
assert.equal(foreignReference.statusCode, 404)

currentPolicy = { ...policy, checkoutMode: 'human' }
assert.equal((await request(handler, { action: 'prepare', agreementId, payerReference, payerAddress: payer })).statusCode, 403)
currentPolicy = null
assert.equal((await request(handler, { action: 'prepare', agreementId, payerReference, payerAddress: payer })).statusCode, 401)
assert.equal((await request(handler, {}, 'GET')).statusCode, 405)
const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /app\.post\('\/api\/v2\/agreements\/agent'/)

function memoryDependencies() {
  let store
  let now = new Date('2026-08-04T12:00:00.000Z')
  return {
    dependencies: {
      hasStore: () => true,
      read: async () => store,
      mutate: async (_key, update) => {
        store = await update(store)
        return store
      },
      queueWebhook: async () => ({ replayed: false }),
      now: () => new Date(now),
    },
    setAttemptStatus: async status => {
      await (async () => {
        const ids = Object.keys(store.attempts)
        store.attempts[ids[0]] = { ...store.attempts[ids[0]], status }
      })()
    },
  }
}

const activationEnv = {
  ARC_AGREEMENTS_ENABLED: 'true',
  ARC_AGREEMENT_FACTORY_ADDRESS: REVIEWED_ARC_AGREEMENT_FACTORY,
  ARC_AGREEMENT_OPERATOR_ADDRESS: REVIEWED_ARC_AGREEMENT_OPERATOR,
  ARC_AGREEMENT_OPERATOR_WALLET_ID: 'e3fe3e85-1111-4111-8111-11111111d4d9',
  ARC_AGREEMENT_ALLOWED_PROJECT_IDS: partnerId,
  ARC_AGREEMENT_ALLOWED_CHECKOUT_MODES: 'agentic',
  ARC_AGREEMENT_MAX_USDC: '1',
  ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT: '1',
  ARC_AGREEMENT_DAILY_VOLUME_USDC: '1',
  ARC_AGREEMENT_MAX_DURATION_SECONDS: '604800',
  ARC_AGREEMENT_CONFIRMATION_BLOCKS: '5',
  CIRCLE_TEST_API_KEY: 'TEST_API_KEY:test-id:test-secret',
  CIRCLE_ENTITY_SECRET: 'c'.repeat(64),
  PRIVATE_RPC_URL_ARC: 'https://rpc.testnet.arc.network',
}
const memory = memoryDependencies()
const actualPrepared = await prepareArcAgreementActivationAttempt({
  policy,
  agreementId,
  draft: { clientReference: agreement.clientReference, termsHash: agreement.termsHash, chainTerms },
  payer,
  payerIdentity: identity,
  env: activationEnv,
}, memory.dependencies)
assert.equal(actualPrepared.attempt.checkoutMode, 'agentic')

const approvalCall = await prepareArcAgreementAgentPayerCall({
  policy, agreementId, payer, payerIdentity: identity, stage: 'approval', env: activationEnv,
}, memory.dependencies)
assert.equal(approvalCall.call.to, ARC_AGREEMENT_NETWORK.usdc)
assert.equal(approvalCall.preparation.sequence, 0)
const replayedApproval = await prepareArcAgreementAgentPayerCall({
  policy, agreementId, payer, payerIdentity: identity, stage: 'approval', env: activationEnv,
}, memory.dependencies)
assert.equal(replayedApproval.replayed, true)

const approvalHash = `0x${'8'.repeat(64)}`
const directClient = {
  getChainId: async () => ARC_AGREEMENT_NETWORK.chainId,
  getBlockNumber: async () => 100n,
  getBlock: async () => ({ timestamp: 0n }),
  getTransaction: async () => ({
    hash: approvalHash,
    from: payer,
    to: approvalCall.call.to,
    input: approvalCall.call.data,
    value: 0n,
  }),
  getTransactionReceipt: async () => null,
  readContract: async () => 0n,
}
const recordedApproval = await recordArcAgreementPayerTransaction({
  client: directClient,
  policy,
  agreementId,
  payer,
  payerIdentity: identity,
  stage: 'approval',
  transactionHash: approvalHash,
  requireAgentPreparation: true,
  directOnly: true,
  env: activationEnv,
}, memory.dependencies)
assert.equal(recordedApproval.attempt.status, 'approval_submitted')
assert.equal(recordedApproval.attempt.transactions[0].execution, 'direct')

await memory.setAttemptStatus('ready_to_activate')
const activationCall = await prepareArcAgreementAgentPayerCall({
  policy, agreementId, payer, payerIdentity: identity, stage: 'activation', env: activationEnv,
}, memory.dependencies)
assert.equal(activationCall.call.to, REVIEWED_ARC_AGREEMENT_FACTORY)
assert.equal(activationCall.attempt.capacityReservation.amountUsdcUnits, '1000000')
const replayedActivation = await prepareArcAgreementAgentPayerCall({
  policy, agreementId, payer, payerIdentity: identity, stage: 'activation', env: activationEnv,
}, memory.dependencies)
assert.equal(replayedActivation.replayed, true)

await assert.rejects(prepareArcAgreementAgentPayerCall({
  policy,
  agreementId,
  payer,
  payerIdentity: `agent:${partnerId}:apr_${'d'.repeat(40)}`,
  stage: 'activation',
  env: activationEnv,
}, memory.dependencies), /another authenticated agent payer/)

console.log('Arc Agreement direct agent lifecycle adapter smoke checks passed.')

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createArcAgreementOperationsHandler } from '../api/arc-agreement-operations.ts'

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    status(value) {
      this.statusCode = value
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

async function request(handler, method, body = {}, headers = {}) {
  const res = response()
  await handler({ method, body, headers, query: {} }, res)
  return res
}

const partnerId = 'dev_operations1234'
const agreementId = 'agr_operations1234'
const escrow = '0x5555555555555555555555555555555555555555'
const operator = '0x4444444444444444444444444444444444444444'
const recipient = '0x2222222222222222222222222222222222222222'
const identity = { userId: 'did:privy:operations-reviewer', email: 'operations@example.com' }
const prepared = {
  chainId: 5_042_002,
  agreementId: `0x${'3'.repeat(64)}`,
  clientReference: `0x${'4'.repeat(64)}`,
  termsHash: `0x${'5'.repeat(64)}`,
  factory: '0x3333333333333333333333333333333333333333',
  payer: '0x1111111111111111111111111111111111111111',
  recipient,
  operator,
  usdc: '0x3600000000000000000000000000000000000000',
  templateCode: 0,
  totalAmount: 10_000_000n,
  cancelUntil: 1_785_334_500n,
  expiresAt: 1_785_420_000n,
  cumulativeReleaseBps: [10_000],
}
const agreement = {
  id: agreementId,
  partnerId,
  title: 'Reviewed service',
  description: 'Release only after evidence review.',
  amount: '10',
  recipient,
  template: 'fixed_unlock',
  requestHash: 'must-not-leak',
  payerAccessHash: 'must-not-leak',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
}
const attempt = {
  id: 'aat_operations1234567890',
  partnerId,
  agreementId,
  payerIdentityHash: 'must-not-leak',
  checkoutMode: 'human',
  status: 'active',
  escrow,
  prepared,
  challenges: [{ challengeId: 'must-not-leak', walletId: 'must-not-leak' }],
  createdAt: agreement.createdAt,
  updatedAt: agreement.updatedAt,
}
let operatorAction = {
  id: 'opa_aaaaaaaaaaaaaaaaaaaaaaaa',
  partnerId,
  agreementId,
  action: 'release',
  step: 0,
  evidenceHash: `0x${'6'.repeat(64)}`,
  evidenceReference: 'evidence://delivery/123',
  requestHash: 'a'.repeat(64),
  idempotencyKey: 'must-not-leak',
  requestedBy: 'did:privy:operations-requester',
  requestedAt: agreement.createdAt,
  status: 'awaiting_review',
  preparedCall: {
    walletId: 'must-not-leak',
    operatorAddress: operator,
    contractAddress: escrow,
    abiFunctionSignature: 'releaseStep(uint8,bytes32)',
    abiParameters: [0, `0x${'6'.repeat(64)}`],
    refId: `${agreementId}:release:0`,
  },
  providerTransactionId: 'must-not-leak',
  attempts: 0,
  updatedAt: agreement.updatedAt,
}
const payerAction = {
  id: 'pal_operations1234567890',
  partnerId,
  agreementId,
  action: 'cancel',
  payerIdentityHash: 'must-not-leak',
  walletId: 'must-not-leak',
  walletAddress: prepared.payer,
  escrow,
  directCall: {},
  wrappedCall: {},
  requestHash: 'must-not-leak',
  sequence: 0,
  idempotencyKey: 'must-not-leak',
  status: 'manual_review',
  providerTransactionId: 'must-not-leak',
  lastError: 'Circle returned conflicting transaction evidence.',
  createdAt: agreement.createdAt,
  updatedAt: agreement.updatedAt,
}
let activeIdentity = identity
let preparedInput
let cancellationInput
let createdInput
let approvedInput
let confirmedFails = false
const dependencies = {
  verifyAdmin: async () => {
    if (!activeIdentity) throw Object.assign(new Error('Developer operations access is restricted.'), { status: 403 })
    return activeIdentity
  },
  listAgreements: async () => [agreement],
  listAttempts: async () => [attempt],
  listOperatorActions: async () => [operatorAction],
  listPayerActions: async () => [payerAction],
  binding: async () => ({ partnerId, agreementId, escrow, prepared }),
  confirmed: async () => {
    if (confirmedFails) throw new Error('RPC unavailable')
    return {
      snapshot: {
        status: 1,
        nextStep: 0,
        releasedAmount: 0n,
        tokenBalance: 10_000_000n,
        cancelUntil: prepared.cancelUntil,
        expiresAt: prepared.expiresAt,
        operator,
      },
      observedBlockNumber: 100n,
    }
  },
  prepareRelease: input => {
    preparedInput = input
    return {
      idempotencyKey: input.idempotencyKey,
      walletId: 'operator-wallet-id',
      operatorAddress: operator,
      network: 'ARC-TESTNET',
      contractAddress: escrow,
      feeLevel: 'MEDIUM',
      refId: `${agreementId}:release:${input.step}`,
      abiFunctionSignature: 'releaseStep(uint8,bytes32)',
      abiParameters: [input.step, input.evidenceHash],
    }
  },
  prepareCancellation: input => {
    cancellationInput = input
    return {
      idempotencyKey: input.idempotencyKey,
      walletId: 'operator-wallet-id',
      operatorAddress: operator,
      network: 'ARC-TESTNET',
      contractAddress: escrow,
      feeLevel: 'MEDIUM',
      refId: `${agreementId}:cancel`,
      abiFunctionSignature: 'cancelByOperator(bytes32)',
      abiParameters: [input.reasonHash],
    }
  },
  createAction: async input => {
    createdInput = input
    operatorAction = { ...operatorAction, ...input, id: operatorAction.id, status: 'awaiting_review', attempts: 0, requestedAt: agreement.createdAt, updatedAt: agreement.updatedAt }
    return operatorAction
  },
  approveAction: async input => {
    approvedInput = input
    if (input.reviewedBy === operatorAction.requestedBy) {
      throw new Error('Operator action requires an independent reviewer.')
    }
    operatorAction = { ...operatorAction, status: 'queued', reviewedBy: input.reviewedBy, reviewNote: input.reviewNote }
    return operatorAction
  },
  operatorClient: () => ({
    operatorWallet: async () => ({ walletId: 'operator-wallet-id', address: operator }),
  }),
  chainClient: () => ({}),
  createIdempotencyKey: () => '123e4567-e89b-42d3-a456-426614174099',
  env: () => ({ ARC_AGREEMENT_OPERATOR_WORKER_ENABLED: 'false' }),
}
const handler = createArcAgreementOperationsHandler(dependencies)

activeIdentity = null
const forbidden = await request(handler, 'GET')
assert.equal(forbidden.statusCode, 403)
activeIdentity = identity

const listed = await request(handler, 'GET')
assert.equal(listed.statusCode, 200)
assert.equal(listed.headers['cache-control'], 'no-store')
assert.equal(listed.body.workerEnabled, false)
assert.equal(listed.body.summary.total, 1)
assert.equal(listed.body.summary.active, 1)
assert.equal(listed.body.summary.review, 1)
assert.equal(listed.body.summary.attention, 1)
assert.equal(listed.body.agreements[0].chain.status, 'active')
assert.equal(listed.body.agreements[0].operatorActions[0].status, 'awaiting_review')
assert.equal(listed.body.agreements[0].payerAction.status, 'manual_review')
const publicPayload = JSON.stringify(listed.body)
for (const secret of ['must-not-leak', 'idempotencyKey', 'providerTransactionId', 'payerIdentityHash', 'challengeId', 'walletId']) {
  assert.equal(publicPayload.includes(secret), false)
}
confirmedFails = true
const unavailable = await request(handler, 'GET')
assert.equal(unavailable.statusCode, 200)
assert.equal(unavailable.body.agreements[0].chain, null)
assert.equal(unavailable.body.agreements[0].chainUnavailable, true)
assert.equal(JSON.stringify(unavailable.body).includes('RPC unavailable'), false)
confirmedFails = false

assert.equal((await request(handler, 'POST', {
  action: 'request-release',
  agreementId,
  partnerId,
  evidenceHash: '0x1234',
  evidenceReference: 'evidence://delivery/123',
})).statusCode, 400)
const created = await request(handler, 'POST', {
  action: 'request-release',
  agreementId,
  partnerId,
  evidenceHash: `0x${'7'.repeat(64)}`,
  evidenceReference: 'evidence://delivery/456',
})
assert.equal(created.statusCode, 201)
assert.equal(created.body.workerEnabled, false)
assert.equal(preparedInput.step, 0)
assert.equal(createdInput.requestedBy, identity.userId)
assert.equal(createdInput.preparedCall.refId, `${agreementId}:release:0`)

operatorAction = { ...operatorAction, reviewPolicy: 'payer' }
const payerOnlyApproval = await request(handler, 'POST', {
  action: 'approve',
  actionId: operatorAction.id,
  requestHash: operatorAction.requestHash,
  reviewNote: 'Operations must not bypass payer review.',
})
assert.equal(payerOnlyApproval.statusCode, 409)
operatorAction = { ...operatorAction, reviewPolicy: 'operations' }

activeIdentity = { ...identity, userId: createdInput.requestedBy }
operatorAction = { ...operatorAction, requestedBy: createdInput.requestedBy }
const selfApproval = await request(handler, 'POST', {
  action: 'approve',
  actionId: operatorAction.id,
  requestHash: operatorAction.requestHash,
  reviewNote: 'Evidence independently reviewed.',
})
assert.equal(selfApproval.statusCode, 409)

activeIdentity = { ...identity, userId: 'did:privy:independent-reviewer' }
const approved = await request(handler, 'POST', {
  action: 'approve',
  actionId: operatorAction.id,
  requestHash: operatorAction.requestHash,
  reviewNote: 'Evidence independently reviewed.',
})
assert.equal(approved.statusCode, 200)
assert.equal(approved.body.operatorAction.status, 'queued')
assert.equal(approved.body.workerEnabled, false)
assert.equal(approvedInput.reviewedBy, activeIdentity.userId)

const cancellation = await request(handler, 'POST', {
  action: 'request-cancel',
  agreementId,
  partnerId,
  evidenceHash: `0x${'8'.repeat(64)}`,
  evidenceReference: 'reason://operations/cancel-456',
})
assert.equal(cancellation.statusCode, 201)
assert.equal(cancellationInput.reasonHash, `0x${'8'.repeat(64)}`)
assert.equal(createdInput.action, 'cancel')
assert.equal('step' in createdInput, false)

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /app\.all\('\/api\/arc-agreement-operations',\s+strictLimiter,\s+arcAgreementOperationsHandler\)/)
const pageSource = await readFile(new URL('../src/pages/DeveloperOperationsPage.tsx', import.meta.url), 'utf8')
const panelSource = await readFile(new URL('../src/components/ArcAgreementOperationsPanel.tsx', import.meta.url), 'utf8')
const handlerSource = await readFile(new URL('../api/arc-agreement-operations.ts', import.meta.url), 'utf8')
assert.match(pageSource, /Arc Agreements/)
assert.match(pageSource, /<ArcAgreementOperationsPanel/)
assert.match(panelSource, /\/api\/arc-agreement-operations/)
assert.match(panelSource, /A different allowlisted operations identity must review this request/)
assert.match(panelSource, /Execution remains disabled/)
assert.doesNotMatch(panelSource, /idempotencyKey|providerTransactionId|challengeId|payerIdentityHash|walletId/)
assert.match(handlerSource, /verifyDeveloperOperationsAdmin/)
const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
assert.match(envExample, /^ARC_AGREEMENT_OPERATOR_WORKER_ENABLED=false$/m)

console.log('Arc Agreement restricted operations adapter smoke checks passed.')

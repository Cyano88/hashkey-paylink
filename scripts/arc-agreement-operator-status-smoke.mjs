import assert from 'node:assert/strict'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import { prepareArcAgreementReleaseCall } from '../api/arc-agreement-operator.ts'
import { fetchAndVerifyArcAgreementOperatorWallet } from '../api/arc-agreement-operator-wallet.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import {
  fetchAndVerifyArcAgreementOperatorTransaction,
  verifyArcAgreementOperatorTransaction,
} from '../api/arc-agreement-operator-status.ts'

const partnerId = 'dev_operatorstatus1234'
const agreementId = 'agr_operatorstatus1234'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x5555555555555555555555555555555555555555'
const walletId = '123e4567-e89b-42d3-a456-426614174000'
const idempotencyKey = '123e4567-e89b-42d3-b456-426614174001'
const transactionId = '123e4567-e89b-42d3-a456-426614174002'
const requestId = '123e4567-e89b-42d3-a456-426614174003'
const evidenceHash = `0x${'11'.repeat(32)}`
const txHash = `0x${'aa'.repeat(32)}`
const apiKey = 'TEST_API_KEY:operator-status'

const operatorWallet = await fetchAndVerifyArcAgreementOperatorWallet({
  apiKey,
  walletId,
  expectedOperator: operator,
  requestId: crypto.randomUUID(),
  fetchImpl: async () => new Response(JSON.stringify({ data: { wallet: {
      id: walletId,
      address: operator,
      blockchain: 'ARC-TESTNET',
      custodyType: 'DEVELOPER',
      state: 'LIVE',
      accountType: 'EOA',
    } } }), { status: 200 }),
})
const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:operator-status-test',
  title: 'Operator status test',
  description: 'Bind Circle transaction status to the prepared operator call.',
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
const preparedCall = prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash,
})

function transaction(overrides = {}) {
  return {
    data: {
      transaction: {
        id: transactionId,
        blockchain: 'ARC-TESTNET',
        state: 'COMPLETE',
        transactionType: 'OUTBOUND',
        operation: 'CONTRACT_EXECUTION',
        custodyType: 'DEVELOPER',
        walletId,
        sourceAddress: operator,
        contractAddress: escrow,
        abiFunctionSignature: 'releaseStep(uint8,bytes32)',
        abiParameters: ['0', evidenceHash.toUpperCase()],
        refId: `${agreementId}:release:0`,
        txHash,
        blockHeight: 12345,
        ...overrides,
      },
    },
  }
}

const verified = verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction(),
})
assert.deepEqual(verified, {
  verified: true,
  transactionId,
  circleState: 'COMPLETE',
  classification: 'chain_reconciliation_required',
  txHash,
  blockHeight: 12345,
  authoritativeAgreementState: false,
  requiresConfirmedChainReconciliation: true,
})

const pending = verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({
    state: 'QUEUED',
    txHash: undefined,
    blockHeight: undefined,
    custodyType: undefined,
    operation: undefined,
  }),
})
assert.equal(pending.classification, 'pending')
assert.equal(pending.requiresConfirmedChainReconciliation, false)
assert.equal(pending.txHash, null)

const failed = verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ state: 'FAILED', txHash: undefined, blockHeight: undefined }),
})
assert.equal(failed.classification, 'failed')
assert.equal(failed.authoritativeAgreementState, false)

assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall: { ...preparedCall },
  response: transaction(),
}), /not prepared by the verified policy boundary/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ blockchain: 'BASE-SEPOLIA' }),
}), /prepared Arc network/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ custodyType: 'ENDUSER' }),
}), /developer-controlled/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ walletId: '123e4567-e89b-42d3-a456-426614174099' }),
}), /prepared wallet/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ sourceAddress: payer }),
}), /verified operator/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ contractAddress: factory }),
}), /prepared escrow/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ abiFunctionSignature: 'cancelByOperator(bytes32)' }),
}), /prepared call/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ abiParameters: ['1', evidenceHash] }),
}), /parameters/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ refId: 'agr_other:release:0' }),
}), /reference/)
assert.throws(() => verifyArcAgreementOperatorTransaction({
  transactionId,
  preparedCall,
  response: transaction({ state: 'COMPLETE', txHash: undefined }),
}), /transaction hash/)

let observedRequest
const fetched = await fetchAndVerifyArcAgreementOperatorTransaction({
  apiKey,
  transactionId,
  requestId,
  preparedCall,
  fetchImpl: async (url, init) => {
    observedRequest = { url, init }
    return new Response(JSON.stringify(transaction()), { status: 200 })
  },
})
assert.equal(fetched.circleState, 'COMPLETE')
assert.equal(observedRequest.url, `https://api.circle.com/v1/w3s/transactions/${transactionId}?txType=OUTBOUND`)
assert.equal(observedRequest.init.method, 'GET')
assert.equal(observedRequest.init.redirect, 'error')
assert.equal(observedRequest.init.headers.authorization, `Bearer ${apiKey}`)
assert.equal(observedRequest.init.headers['x-request-id'], requestId)

await assert.rejects(() => fetchAndVerifyArcAgreementOperatorTransaction({
  apiKey,
  transactionId,
  requestId,
  preparedCall,
  fetchImpl: async () => new Response('', { status: 401 }),
}), /authentication failed/)

console.log('Arc Agreement operator transaction status smoke checks passed.')

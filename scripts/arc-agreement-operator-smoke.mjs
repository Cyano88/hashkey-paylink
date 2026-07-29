import assert from 'node:assert/strict'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import { prepareArcAgreementDeployment } from '../api/arc-agreement-reconciliation.ts'
import {
  prepareArcAgreementCancellationCall,
  prepareArcAgreementReleaseCall,
} from '../api/arc-agreement-operator.ts'
import {
  fetchAndVerifyArcAgreementOperatorWallet,
} from '../api/arc-agreement-operator-wallet.ts'
import * as operatorWalletModule from '../api/arc-agreement-operator-wallet.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'

const partnerId = 'dev_operatorrequest1234'
const agreementId = 'agr_operatorrequest1234'
const payer = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const factory = '0x3333333333333333333333333333333333333333'
const operator = '0x4444444444444444444444444444444444444444'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x5555555555555555555555555555555555555555'
const walletId = '123e4567-e89b-42d3-a456-426614174000'
const idempotencyKey = '123e4567-e89b-42d3-b456-426614174001'
const evidenceHash = `0x${'11'.repeat(32)}`
const reasonHash = `0x${'22'.repeat(32)}`
const walletResponse = {
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
}
assert.equal('verifyArcAgreementOperatorWallet' in operatorWalletModule, false)
const operatorWallet = await fetchAndVerifyArcAgreementOperatorWallet({
  apiKey: 'TEST_API_KEY:operator-preflight',
  walletId,
  expectedOperator: operator,
  requestId: '123e4567-e89b-42d3-a456-426614174002',
  fetchImpl: async () => new Response(JSON.stringify(walletResponse), { status: 200 }),
})
const terms = arcAgreementTerms({
  template: 'progressive_release',
  resourceId: 'service:operator-test',
  title: 'Operator request test',
  description: 'Validate constrained Circle contract execution requests.',
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
async function confirmedSnapshot(overrides = {}) {
  const values = {
    ...prepared,
    status: 1,
    nextStep: 0,
    releasedAmount: 0n,
    ...overrides,
  }
  return readConfirmedArcAgreementSnapshot({
    getChainId: async () => 5_042_002,
    getBlockNumber: async () => 100n,
    readContract: async args => {
      if (args.functionName === 'balanceOf') return overrides.tokenBalance ?? prepared.totalAmount
      if (args.functionName === 'releaseSchedule') return values.cumulativeReleaseBps
      if (args.functionName === 'template') return values.templateCode
      return values[args.functionName]
    },
  }, escrow, 5)
}
const confirmed = await confirmedSnapshot()
assert.equal(Object.isFrozen(confirmed), true)
assert.equal(Object.isFrozen(confirmed.snapshot), true)
assert.equal(Object.isFrozen(confirmed.snapshot.cumulativeReleaseBps), true)

const release = prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash,
})
assert.equal(release.network, 'ARC-TESTNET')
assert.equal(release.operatorAddress, operator)
assert.equal('blockchain' in release, false)
assert.equal(release.contractAddress, escrow)
assert.equal(release.abiFunctionSignature, 'releaseStep(uint8,bytes32)')
assert.deepEqual(release.abiParameters, [0, evidenceHash])
assert.equal(release.refId, `${agreementId}:release:0`)
assert.equal('entitySecretCiphertext' in release, false)

const cancellation = prepareArcAgreementCancellationCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  reasonHash,
})
assert.equal(cancellation.abiFunctionSignature, 'cancelByOperator(bytes32)')
assert.deepEqual(cancellation.abiParameters, [reasonHash])
const mismatchedTerms = await confirmedSnapshot({ termsHash: `0x${'ff'.repeat(32)}` })
const cancelledAgreement = await confirmedSnapshot({ status: 3, tokenBalance: 0n })

assert.throws(() => prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 1,
  evidenceHash,
}), /confirmed next step/)
assert.throws(() => prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash: `0x${'00'.repeat(32)}`,
}), /non-zero bytes32/)
assert.throws(() => prepareArcAgreementReleaseCall({
  operatorWallet: { ...operatorWallet, walletId: 'not-a-wallet-id' },
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash,
}), /ownership preflight/)
assert.throws(() => prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId: 'unsafe:reference',
  prepared,
  confirmed,
  step: 0,
  evidenceHash,
}), /Agreement id/)
assert.throws(() => prepareArcAgreementCancellationCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed: mismatchedTerms,
  reasonHash,
}), /reconciliation: termsHash/)
assert.throws(() => prepareArcAgreementCancellationCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed: cancelledAgreement,
  reasonHash,
}), /active agreement/)

assert.throws(() => prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId,
  agreementId,
  prepared,
  confirmed: { ...confirmed },
  step: 0,
  evidenceHash,
}), /confirmed-chain read boundary/)

assert.throws(() => prepareArcAgreementReleaseCall({
  operatorWallet,
  idempotencyKey,
  partnerId: 'dev_otherproject1234',
  agreementId,
  prepared,
  confirmed,
  step: 0,
  evidenceHash,
}), /durable developer agreement/)

for (const [overrides, message] of [
  [{ blockchain: 'BASE-SEPOLIA' }, /ARC-TESTNET/],
  [{ custodyType: 'ENDUSER' }, /developer-controlled/],
  [{ state: 'FROZEN' }, /must be live/],
  [{ address: payer }, /immutable agreement operator/],
]) {
  await assert.rejects(() => fetchAndVerifyArcAgreementOperatorWallet({
    apiKey: 'TEST_API_KEY:operator-preflight',
    walletId,
    expectedOperator: operator,
    requestId: crypto.randomUUID(),
    fetchImpl: async () => new Response(JSON.stringify({
      data: { wallet: { ...walletResponse.data.wallet, ...overrides } },
    }), { status: 200 }),
  }), message)
}

let observedRequest
const fetchedWallet = await fetchAndVerifyArcAgreementOperatorWallet({
  apiKey: 'TEST_API_KEY:operator-preflight',
  walletId,
  expectedOperator: operator,
  requestId: '123e4567-e89b-42d3-a456-426614174003',
  fetchImpl: async (url, init) => {
    observedRequest = { url, init }
    return new Response(JSON.stringify(walletResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  },
})
assert.deepEqual(fetchedWallet, operatorWallet)
assert.equal(observedRequest.url, `https://api.circle.com/v1/w3s/wallets/${walletId}`)
assert.equal(observedRequest.init.method, 'GET')
assert.equal(observedRequest.init.redirect, 'error')
assert.equal(observedRequest.init.headers.authorization, 'Bearer TEST_API_KEY:operator-preflight')
assert.equal(observedRequest.init.headers['x-request-id'], '123e4567-e89b-42d3-a456-426614174003')
await assert.rejects(() => fetchAndVerifyArcAgreementOperatorWallet({
  apiKey: 'TEST_API_KEY:operator-preflight',
  walletId,
  expectedOperator: operator,
  requestId: '123e4567-e89b-42d3-a456-426614174004',
  fetchImpl: async () => new Response('', { status: 401 }),
}), /authentication failed/)

console.log('Arc Agreement managed operator request smoke checks passed.')

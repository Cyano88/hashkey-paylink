import assert from 'node:assert/strict'
import { AbiCoder, getAddress, id, keccak256, parseUnits, toUtf8Bytes } from 'ethers'
import { arcAgreementClientReference, arcAgreementTerms } from '../api/arc-agreement-terms.ts'
import {
  prepareArcAgreementDeployment,
  readArcAgreementSnapshot,
  reconcileArcAgreementSnapshot,
} from '../api/arc-agreement-reconciliation.ts'

const abi = AbiCoder.defaultAbiCoder()
const recipient = '0x2222222222222222222222222222222222222222'
const payer = '0x3333333333333333333333333333333333333333'
const factory = '0x4444444444444444444444444444444444444444'
const operator = '0x5555555555555555555555555555555555555555'
const usdc = '0x3600000000000000000000000000000000000000'
const escrow = '0x7777777777777777777777777777777777777777'
const partnerId = 'project_reconciliation'
const draftId = 'agr_reconciliation0001'

const termsInput = {
  template: 'progressive_release',
  resourceId: 'content:research-0001',
  title: 'Premium research access',
  description: 'Unlock one premium research report.',
  amount: '10.5',
  recipient,
  checkpoints: [{ percentage: 25 }, { percentage: 50 }, { percentage: 75 }, { percentage: 100 }],
  durationSeconds: 86400,
  cancellationWindowSeconds: 900,
}
const terms = arcAgreementTerms(termsInput)

const domain = keccak256(toUtf8Bytes('HASH_PAYLINK_ARC_AGREEMENT_TERMS_V1'))
const scheduleHash = keccak256(abi.encode(['uint16[]'], [terms.cumulativeReleaseBps]))
const independentlyEncodedTerms = keccak256(abi.encode(
  ['bytes32', 'uint8', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'address', 'bytes32', 'uint64', 'uint64'],
  [
    domain,
    1,
    keccak256(toUtf8Bytes(termsInput.resourceId)),
    keccak256(toUtf8Bytes(termsInput.title)),
    keccak256(toUtf8Bytes(termsInput.description)),
    parseUnits(termsInput.amount, 6),
    getAddress(recipient),
    scheduleHash,
    termsInput.durationSeconds,
    termsInput.cancellationWindowSeconds,
  ],
))
assert.equal(terms.termsHash, independentlyEncodedTerms)
assert.deepEqual(terms.cumulativeReleaseBps, [2500, 5000, 7500, 10000])

const clientReference = arcAgreementClientReference(partnerId, draftId)
const referenceDomain = keccak256(toUtf8Bytes('HASH_PAYLINK_ARC_AGREEMENT_REFERENCE_V1'))
assert.equal(clientReference, keccak256(abi.encode(
  ['bytes32', 'bytes32', 'bytes32'],
  [referenceDomain, keccak256(toUtf8Bytes(partnerId)), keccak256(toUtf8Bytes(draftId))],
)))

const prepared = prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
})
assert.equal(prepared.chainId, 5042002)
assert.equal(prepared.agreementId, keccak256(abi.encode(['address', 'bytes32'], [payer, clientReference])))
assert.equal(prepared.cancelUntil, 1_785_240_900n)
assert.equal(prepared.expiresAt, 1_785_326_400n)
assert.match(prepared.deploymentHash, /^0x[a-f0-9]{64}$/)

const releasedAmount = BigInt(terms.amountUsdcUnits) * 2500n / 10000n
const functionValues = {
  agreementId: prepared.agreementId,
  clientReference: prepared.clientReference,
  termsHash: prepared.termsHash,
  factory: prepared.factory,
  payer: prepared.payer,
  recipient: prepared.recipient,
  operator: prepared.operator,
  usdc: prepared.usdc,
  template: prepared.templateCode,
  totalAmount: prepared.totalAmount,
  cancelUntil: prepared.cancelUntil,
  expiresAt: prepared.expiresAt,
  status: 1,
  nextStep: 1,
  releasedAmount,
  releaseSchedule: prepared.cumulativeReleaseBps,
}
const client = {
  getChainId: async () => 5042002,
  readContract: async ({ functionName }) => functionName === 'balanceOf'
    ? prepared.totalAmount - releasedAmount
    : functionValues[functionName],
}
const snapshot = await readArcAgreementSnapshot(client, escrow)
assert.equal(snapshot.escrow, getAddress(escrow))
assert.equal(snapshot.tokenBalance, prepared.totalAmount - releasedAmount)

const verified = reconcileArcAgreementSnapshot(prepared, snapshot)
assert.equal(verified.verified, true)
assert.deepEqual(verified.mismatches, [])
assert.equal(verified.lifecycle, 'active')
assert.equal(verified.obligationAmount, (prepared.totalAmount - releasedAmount).toString())

const wrongRecipient = reconcileArcAgreementSnapshot(prepared, {
  ...snapshot,
  recipient: '0x8888888888888888888888888888888888888888',
})
assert.equal(wrongRecipient.verified, false)
assert.ok(wrongRecipient.mismatches.includes('recipient'))

const underfunded = reconcileArcAgreementSnapshot(prepared, { ...snapshot, tokenBalance: 1n })
assert.equal(underfunded.verified, false)
assert.ok(underfunded.mismatches.includes('principalBalance'))

const wrongProgress = reconcileArcAgreementSnapshot(prepared, { ...snapshot, releasedAmount: releasedAmount + 1n })
assert.equal(wrongProgress.verified, false)
assert.ok(wrongProgress.mismatches.includes('releaseProgress'))

const wrongChain = reconcileArcAgreementSnapshot(prepared, { ...snapshot, chainId: 8453 })
assert.equal(wrongChain.verified, false)
assert.ok(wrongChain.mismatches.includes('chainId'))

const completed = reconcileArcAgreementSnapshot(prepared, {
  ...snapshot,
  status: 2,
  nextStep: prepared.cumulativeReleaseBps.length,
  releasedAmount: prepared.totalAmount,
  tokenBalance: 0n,
})
assert.equal(completed.verified, true)
assert.equal(completed.lifecycle, 'completed')

const inactive = reconcileArcAgreementSnapshot(prepared, {
  ...snapshot,
  status: 0,
  nextStep: 0,
  releasedAmount: 0n,
  tokenBalance: prepared.totalAmount,
})
assert.equal(inactive.verified, false)
assert.ok(inactive.mismatches.includes('inactiveState'))

assert.throws(() => prepareArcAgreementDeployment({
  draft: {
    clientReference,
    termsHash: terms.termsHash,
    chainTerms: { ...terms, cumulativeReleaseBps: [5000] },
  },
  payer,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /progressive release schedule/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer: recipient,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /different addresses/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer: operator,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /operator must be different/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: {
    clientReference,
    termsHash: terms.termsHash,
    chainTerms: { ...terms, recipient: operator },
  },
  payer,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /operator must be different/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer: usdc,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /USDC must be different/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer,
  factory,
  operator: usdc,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /USDC must be different/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: {
    clientReference,
    termsHash: terms.termsHash,
    chainTerms: { ...terms, amountUsdcUnits: '1', cumulativeReleaseBps: [5000, 10000] },
  },
  payer,
  factory,
  operator,
  usdc,
  activationTimestamp: 1_785_240_000,
}), /too small for this release schedule/)

assert.throws(() => prepareArcAgreementDeployment({
  draft: { clientReference, termsHash: terms.termsHash, chainTerms: terms },
  payer,
  factory,
  operator,
  usdc: '0x9999999999999999999999999999999999999999',
  activationTimestamp: 1_785_240_000,
}), /official Arc Testnet USDC/)

console.log('Arc Agreement terms and reconciliation smoke checks passed.')

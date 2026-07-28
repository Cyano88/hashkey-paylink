import { getAddress, isAddress, type Hex } from 'viem'
import {
  reconcileArcAgreementSnapshot,
  type ArcAgreementChainSnapshot,
  type ArcAgreementPreparedDeployment,
} from './arc-agreement-reconciliation.js'
import {
  assertArcAgreementOperatorWalletProof,
  type ArcAgreementVerifiedOperatorWallet,
} from './arc-agreement-operator-wallet.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BYTES32 = /^0x[0-9a-f]{64}$/i
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const preparedOperatorCalls = new WeakSet<object>()

export type ArcAgreementPreparedOperatorCall = Readonly<{
  idempotencyKey: string
  walletId: string
  operatorAddress: `0x${string}`
  network: 'ARC-TESTNET'
  contractAddress: `0x${string}`
  feeLevel: 'MEDIUM'
  refId: string
  abiFunctionSignature: 'releaseStep(uint8,bytes32)' | 'cancelByOperator(bytes32)'
  abiParameters: readonly (number | Hex)[]
}>

function requiredIdempotencyKey(value: unknown) {
  const idempotencyKey = String(value ?? '').trim()
  if (!UUID_V4.test(idempotencyKey)) throw new Error('Circle operator idempotencyKey must be a UUID v4.')
  return idempotencyKey
}

function requiredEvidence(value: unknown, label: string): Hex {
  const evidence = String(value ?? '').trim()
  if (!BYTES32.test(evidence) || /^0x0{64}$/i.test(evidence)) throw new Error(`${label} must be a non-zero bytes32 value.`)
  return evidence as Hex
}

function requiredAgreementId(value: unknown) {
  const agreementId = String(value ?? '').trim()
  if (!AGREEMENT_ID.test(agreementId)) throw new Error('Agreement id is invalid.')
  return agreementId
}

function requireVerifiedActive(
  prepared: ArcAgreementPreparedDeployment,
  snapshot: ArcAgreementChainSnapshot,
) {
  const reconciliation = reconcileArcAgreementSnapshot(prepared, snapshot)
  if (!reconciliation.verified) {
    throw new Error(`Operator call blocked by reconciliation: ${reconciliation.mismatches.join(', ')}.`)
  }
  if (snapshot.status !== 1) throw new Error('Operator calls require an active agreement.')
  return reconciliation
}

function baseRequest(input: {
  operatorWallet: ArcAgreementVerifiedOperatorWallet
  idempotencyKey: string
  snapshot: ArcAgreementChainSnapshot
  refId: string
}) {
  if (!isAddress(input.snapshot.escrow)) throw new Error('Escrow address is invalid.')
  const operatorWallet = assertArcAgreementOperatorWalletProof(input.operatorWallet, input.snapshot.operator)
  return {
    idempotencyKey: requiredIdempotencyKey(input.idempotencyKey),
    walletId: operatorWallet.walletId,
    operatorAddress: operatorWallet.address,
    network: 'ARC-TESTNET' as const,
    contractAddress: getAddress(input.snapshot.escrow),
    feeLevel: 'MEDIUM' as const,
    refId: input.refId,
  }
}

function brandPreparedOperatorCall(
  call: ArcAgreementPreparedOperatorCall,
): ArcAgreementPreparedOperatorCall {
  preparedOperatorCalls.add(call)
  return Object.freeze(call)
}

export function assertArcAgreementPreparedOperatorCall(
  call: ArcAgreementPreparedOperatorCall,
) {
  if (!call || !preparedOperatorCalls.has(call)) {
    throw new Error('Arc Agreement operator call was not prepared by the verified policy boundary.')
  }
  return call
}

export function prepareArcAgreementReleaseCall(input: {
  operatorWallet: ArcAgreementVerifiedOperatorWallet
  idempotencyKey: string
  agreementId: string
  prepared: ArcAgreementPreparedDeployment
  snapshot: ArcAgreementChainSnapshot
  step: number
  evidenceHash: string
}) {
  requireVerifiedActive(input.prepared, input.snapshot)
  const agreementId = requiredAgreementId(input.agreementId)
  if (!Number.isInteger(input.step) || input.step < 0 || input.step > 255) throw new Error('Release step is invalid.')
  if (input.step !== input.snapshot.nextStep) throw new Error('Release step does not match the confirmed next step.')
  if (input.step >= input.prepared.cumulativeReleaseBps.length) throw new Error('Release schedule is already exhausted.')
  const evidenceHash = requiredEvidence(input.evidenceHash, 'evidenceHash')
  return brandPreparedOperatorCall({
    ...baseRequest({
      operatorWallet: input.operatorWallet,
      idempotencyKey: input.idempotencyKey,
      snapshot: input.snapshot,
      refId: `${agreementId}:release:${input.step}`,
    }),
    abiFunctionSignature: 'releaseStep(uint8,bytes32)',
    abiParameters: Object.freeze([input.step, evidenceHash]),
  })
}

export function prepareArcAgreementCancellationCall(input: {
  operatorWallet: ArcAgreementVerifiedOperatorWallet
  idempotencyKey: string
  agreementId: string
  prepared: ArcAgreementPreparedDeployment
  snapshot: ArcAgreementChainSnapshot
  reasonHash: string
}) {
  requireVerifiedActive(input.prepared, input.snapshot)
  const agreementId = requiredAgreementId(input.agreementId)
  const reasonHash = requiredEvidence(input.reasonHash, 'reasonHash')
  return brandPreparedOperatorCall({
    ...baseRequest({
      operatorWallet: input.operatorWallet,
      idempotencyKey: input.idempotencyKey,
      snapshot: input.snapshot,
      refId: `${agreementId}:cancel`,
    }),
    abiFunctionSignature: 'cancelByOperator(bytes32)',
    abiParameters: Object.freeze([reasonHash]),
  })
}

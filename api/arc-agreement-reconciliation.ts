import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from 'viem'
import { assertArcAgreementReleasePayouts } from './arc-agreement-terms.js'
import { ARC_AGREEMENT_NETWORK, assertArcAgreementNetwork } from './arc-agreement-config.js'

const DEPLOYMENT_DOMAIN = keccak256(toBytes('HASH_PAYLINK_ARC_AGREEMENT_DEPLOYMENT_V1'))
const ARC_TESTNET_CHAIN_ID = BigInt(ARC_AGREEMENT_NETWORK.chainId)

const escrowReadAbi = [
  { type: 'function', name: 'agreementId', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'clientReference', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'termsHash', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'payer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'recipient', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'template', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalAmount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'cancelUntil', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'expiresAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'status', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'nextStep', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'releasedAmount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'releaseSchedule', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16[]' }] },
] as const

const erc20BalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

export type ArcAgreementDraftBinding = {
  clientReference: Hex
  termsHash: Hex
  chainTerms: {
    templateCode: number
    amountUsdcUnits: string
    recipient: string
    cumulativeReleaseBps: number[]
    durationSeconds: number
    cancellationWindowSeconds: number
  }
}

export type ArcAgreementPreparedDeployment = {
  chainId: 5042002
  agreementId: Hex
  deploymentHash: Hex
  clientReference: Hex
  termsHash: Hex
  factory: Address
  payer: Address
  recipient: Address
  operator: Address
  usdc: Address
  templateCode: number
  totalAmount: bigint
  cancelUntil: bigint
  expiresAt: bigint
  cumulativeReleaseBps: number[]
}

export type ArcAgreementChainSnapshot = Omit<ArcAgreementPreparedDeployment, 'deploymentHash'> & {
  escrow: Address
  status: number
  nextStep: number
  releasedAmount: bigint
  tokenBalance: bigint
}

export type ArcAgreementPublicClient = {
  getChainId: () => Promise<number>
  readContract: (args: {
    address: Address
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
    blockNumber?: bigint
  }) => Promise<unknown>
}

function address(value: string, label: string) {
  if (!isAddress(value)) throw new Error(`${label} is not a valid EVM address.`)
  return getAddress(value)
}

function sameHex(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase()
}

function bytes32(value: string, label: string) {
  if (!/^0x[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be a bytes32 value.`)
  return value as Hex
}

function deploymentCommitment(input: Omit<ArcAgreementPreparedDeployment, 'chainId' | 'deploymentHash' | 'agreementId'>) {
  return keccak256(encodeAbiParameters([
    { type: 'bytes32' },
    { type: 'uint256' },
    { type: 'address' },
    { type: 'bytes32' },
    { type: 'bytes32' },
    { type: 'address' },
    { type: 'uint64' },
    { type: 'uint64' },
  ], [
    DEPLOYMENT_DOMAIN,
    ARC_TESTNET_CHAIN_ID,
    input.factory,
    input.termsHash,
    input.clientReference,
    input.payer,
    input.cancelUntil,
    input.expiresAt,
  ]))
}

export function prepareArcAgreementDeployment(input: {
  draft: ArcAgreementDraftBinding
  payer: string
  factory: string
  operator: string
  usdc: string
  activationTimestamp: number
}): ArcAgreementPreparedDeployment {
  if (!Number.isInteger(input.activationTimestamp) || input.activationTimestamp <= 0) {
    throw new Error('activationTimestamp must be a positive Unix timestamp.')
  }
  const payer = address(input.payer, 'payer')
  const factory = address(input.factory, 'factory')
  const operator = address(input.operator, 'operator')
  const usdc = address(input.usdc, 'usdc')
  assertArcAgreementNetwork({ chainId: ARC_AGREEMENT_NETWORK.chainId, usdc })
  const recipient = address(input.draft.chainTerms.recipient, 'recipient')
  if (payer === recipient) throw new Error('payer and recipient must be different addresses.')
  const clientReference = bytes32(input.draft.clientReference, 'clientReference')
  const termsHash = bytes32(input.draft.termsHash, 'termsHash')
  const { templateCode, durationSeconds, cancellationWindowSeconds, cumulativeReleaseBps } = input.draft.chainTerms
  if (!Number.isInteger(templateCode) || templateCode < 0 || templateCode > 2) throw new Error('templateCode is invalid.')
  if (!Number.isInteger(durationSeconds) || durationSeconds < 3_600 || durationSeconds > 31_622_400) throw new Error('durationSeconds is invalid.')
  if (!Number.isInteger(cancellationWindowSeconds) || cancellationWindowSeconds < 0 || cancellationWindowSeconds >= durationSeconds) {
    throw new Error('cancellationWindowSeconds is invalid.')
  }
  if (!cumulativeReleaseBps.length || cumulativeReleaseBps.length > 20) throw new Error('release schedule is invalid.')
  if (templateCode === 0 && cumulativeReleaseBps.length !== 1) throw new Error('fixed release schedule is invalid.')
  if (templateCode === 1 && cumulativeReleaseBps.length < 2) throw new Error('progressive release schedule is invalid.')
  if (templateCode === 2 && cumulativeReleaseBps.length > 10) throw new Error('milestone release schedule is invalid.')
  let prior = 0
  for (const step of cumulativeReleaseBps) {
    if (!Number.isInteger(step) || step <= prior || step > 10_000) throw new Error('release schedule is invalid.')
    prior = step
  }
  if (prior !== 10_000) throw new Error('release schedule must end at 10000 basis points.')
  const activationTimestamp = BigInt(input.activationTimestamp)
  const cancelUntil = cancellationWindowSeconds === 0
    ? 0n
    : activationTimestamp + BigInt(cancellationWindowSeconds)
  const expiresAt = activationTimestamp + BigInt(durationSeconds)
  const totalAmount = BigInt(input.draft.chainTerms.amountUsdcUnits)
  if (totalAmount <= 0n || totalAmount > 1_000_000_000_000n) throw new Error('amountUsdcUnits is invalid.')
  assertArcAgreementReleasePayouts(totalAmount, cumulativeReleaseBps)
  const agreementId = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes32' }],
    [payer, clientReference],
  ))
  const base = {
    clientReference,
    termsHash,
    factory,
    payer,
    recipient,
    operator,
    usdc,
    templateCode,
    totalAmount,
    cancelUntil,
    expiresAt,
    cumulativeReleaseBps: [...cumulativeReleaseBps],
  }
  return {
    chainId: ARC_AGREEMENT_NETWORK.chainId,
    agreementId,
    deploymentHash: deploymentCommitment(base),
    ...base,
  }
}

export async function readArcAgreementSnapshot(
  client: ArcAgreementPublicClient,
  escrowValue: string,
  options: { blockNumber?: bigint } = {},
): Promise<ArcAgreementChainSnapshot> {
  const escrow = address(escrowValue, 'escrow')
  const chainId = await client.getChainId()
  const read = (functionName: string) => client.readContract({
    address: escrow,
    abi: escrowReadAbi,
    functionName,
    ...(options.blockNumber === undefined ? {} : { blockNumber: options.blockNumber }),
  })
  const [
    agreementId,
    clientReference,
    termsHash,
    factory,
    payer,
    recipient,
    operator,
    usdc,
    templateCode,
    totalAmount,
    cancelUntil,
    expiresAt,
    status,
    nextStep,
    releasedAmount,
    cumulativeReleaseBps,
  ] = await Promise.all([
    read('agreementId'),
    read('clientReference'),
    read('termsHash'),
    read('factory'),
    read('payer'),
    read('recipient'),
    read('operator'),
    read('usdc'),
    read('template'),
    read('totalAmount'),
    read('cancelUntil'),
    read('expiresAt'),
    read('status'),
    read('nextStep'),
    read('releasedAmount'),
    read('releaseSchedule'),
  ])
  const tokenAddress = address(String(usdc), 'escrow usdc')
  const tokenBalance = await client.readContract({
    address: tokenAddress,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [escrow],
    ...(options.blockNumber === undefined ? {} : { blockNumber: options.blockNumber }),
  })
  return {
    chainId: chainId as 5042002,
    escrow,
    agreementId: agreementId as Hex,
    clientReference: clientReference as Hex,
    termsHash: termsHash as Hex,
    factory: address(String(factory), 'escrow factory'),
    payer: address(String(payer), 'escrow payer'),
    recipient: address(String(recipient), 'escrow recipient'),
    operator: address(String(operator), 'escrow operator'),
    usdc: tokenAddress,
    templateCode: Number(templateCode),
    totalAmount: BigInt(String(totalAmount)),
    cancelUntil: BigInt(String(cancelUntil)),
    expiresAt: BigInt(String(expiresAt)),
    cumulativeReleaseBps: (cumulativeReleaseBps as readonly unknown[]).map(Number),
    status: Number(status),
    nextStep: Number(nextStep),
    releasedAmount: BigInt(String(releasedAmount)),
    tokenBalance: BigInt(String(tokenBalance)),
  }
}

function expectedReleasedAmount(prepared: ArcAgreementPreparedDeployment, nextStep: number) {
  if (nextStep === 0) return 0n
  const scheduleIndex = nextStep - 1
  if (scheduleIndex >= prepared.cumulativeReleaseBps.length) return null
  return scheduleIndex === prepared.cumulativeReleaseBps.length - 1
    ? prepared.totalAmount
    : prepared.totalAmount * BigInt(prepared.cumulativeReleaseBps[scheduleIndex]) / 10_000n
}

export function reconcileArcAgreementSnapshot(
  prepared: ArcAgreementPreparedDeployment,
  snapshot: ArcAgreementChainSnapshot,
) {
  const mismatches: string[] = []
  if (snapshot.chainId !== prepared.chainId) mismatches.push('chainId')
  const compareHex = (label: string, expected: string, actual: string) => {
    if (!sameHex(expected, actual)) mismatches.push(label)
  }
  compareHex('agreementId', prepared.agreementId, snapshot.agreementId)
  compareHex('clientReference', prepared.clientReference, snapshot.clientReference)
  compareHex('termsHash', prepared.termsHash, snapshot.termsHash)
  compareHex('factory', prepared.factory, snapshot.factory)
  compareHex('payer', prepared.payer, snapshot.payer)
  compareHex('recipient', prepared.recipient, snapshot.recipient)
  compareHex('operator', prepared.operator, snapshot.operator)
  compareHex('usdc', prepared.usdc, snapshot.usdc)
  if (prepared.templateCode !== snapshot.templateCode) mismatches.push('template')
  if (prepared.totalAmount !== snapshot.totalAmount) mismatches.push('totalAmount')
  if (prepared.cancelUntil !== snapshot.cancelUntil) mismatches.push('cancelUntil')
  if (prepared.expiresAt !== snapshot.expiresAt) mismatches.push('expiresAt')
  if (prepared.cumulativeReleaseBps.join(',') !== snapshot.cumulativeReleaseBps.join(',')) mismatches.push('releaseSchedule')
  if (!Number.isInteger(snapshot.status) || snapshot.status < 0 || snapshot.status > 4) mismatches.push('status')
  if (snapshot.status === 0) mismatches.push('inactiveState')
  if (!Number.isInteger(snapshot.nextStep) || snapshot.nextStep < 0 || snapshot.nextStep > prepared.cumulativeReleaseBps.length) {
    mismatches.push('nextStep')
  }
  if (snapshot.releasedAmount < 0n || snapshot.releasedAmount > prepared.totalAmount) mismatches.push('releasedAmount')

  const expectedReleased = expectedReleasedAmount(prepared, snapshot.nextStep)
  if (expectedReleased === null || expectedReleased !== snapshot.releasedAmount) mismatches.push('releaseProgress')
  if (snapshot.status === 2 && (snapshot.releasedAmount !== prepared.totalAmount || snapshot.nextStep !== prepared.cumulativeReleaseBps.length)) {
    mismatches.push('completedState')
  }
  if (snapshot.status === 1 && snapshot.releasedAmount === prepared.totalAmount) mismatches.push('activeState')

  const obligation = snapshot.status === 1 ? prepared.totalAmount - snapshot.releasedAmount : 0n
  if (snapshot.tokenBalance < obligation) mismatches.push('principalBalance')
  const excessAmount = snapshot.tokenBalance > obligation ? snapshot.tokenBalance - obligation : 0n

  return {
    verified: mismatches.length === 0,
    mismatches,
    lifecycle: ['awaiting_funding', 'active', 'completed', 'cancelled', 'refunded'][snapshot.status] ?? 'invalid',
    obligationAmount: obligation.toString(),
    releasedAmount: snapshot.releasedAmount.toString(),
    excessAmount: excessAmount.toString(),
  }
}

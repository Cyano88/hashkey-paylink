import { encodeAbiParameters, getAddress, keccak256, parseUnits, toBytes } from 'viem'

export type ArcAgreementTemplate = 'fixed_unlock' | 'progressive_release' | 'milestone'

export type ArcAgreementTermsInput = {
  template: ArcAgreementTemplate
  resourceId: string
  title: string
  description: string
  amount: string
  recipient: string
  checkpoints?: Array<{ percentage: number }>
  milestones?: Array<{ percentage: number }>
  durationSeconds: number
  cancellationWindowSeconds: number
}

const TERMS_DOMAIN = keccak256(toBytes('HASH_PAYLINK_ARC_AGREEMENT_TERMS_V1'))
const CLIENT_REFERENCE_DOMAIN = keccak256(toBytes('HASH_PAYLINK_ARC_AGREEMENT_REFERENCE_V1'))

const TERMS_ABI = [
  { type: 'bytes32' },
  { type: 'uint8' },
  { type: 'bytes32' },
  { type: 'bytes32' },
  { type: 'bytes32' },
  { type: 'uint256' },
  { type: 'address' },
  { type: 'bytes32' },
  { type: 'uint64' },
  { type: 'uint64' },
] as const

const CLIENT_REFERENCE_ABI = [
  { type: 'bytes32' },
  { type: 'bytes32' },
  { type: 'bytes32' },
] as const

export function arcAgreementTemplateCode(template: ArcAgreementTemplate) {
  if (template === 'fixed_unlock') return 0
  if (template === 'progressive_release') return 1
  return 2
}

export function arcAgreementCumulativeReleaseBps(input: Pick<ArcAgreementTermsInput, 'template' | 'checkpoints' | 'milestones'>) {
  if (input.template === 'fixed_unlock') return [10_000]
  if (input.template === 'progressive_release') {
    return (input.checkpoints ?? []).map(checkpoint => checkpoint.percentage * 100)
  }
  let cumulative = 0
  return (input.milestones ?? []).map(milestone => {
    cumulative += milestone.percentage * 100
    return cumulative
  })
}

export function assertArcAgreementReleasePayouts(amountUsdcUnits: bigint, cumulativeReleaseBps: number[]) {
  let previousAmount = 0n
  for (let index = 0; index < cumulativeReleaseBps.length; index++) {
    const cumulativeAmount = index === cumulativeReleaseBps.length - 1
      ? amountUsdcUnits
      : amountUsdcUnits * BigInt(cumulativeReleaseBps[index]) / 10_000n
    if (cumulativeAmount <= previousAmount) {
      throw new Error('Amount is too small for this release schedule after USDC rounding.')
    }
    previousAmount = cumulativeAmount
  }
}

export function arcAgreementTerms(input: ArcAgreementTermsInput) {
  const templateCode = arcAgreementTemplateCode(input.template)
  const amountUsdcUnits = parseUnits(input.amount, 6)
  const recipient = getAddress(input.recipient)
  const cumulativeReleaseBps = arcAgreementCumulativeReleaseBps(input)
  assertArcAgreementReleasePayouts(amountUsdcUnits, cumulativeReleaseBps)
  const scheduleHash = keccak256(encodeAbiParameters([{ type: 'uint16[]' }], [cumulativeReleaseBps]))
  const termsHash = keccak256(encodeAbiParameters(TERMS_ABI, [
    TERMS_DOMAIN,
    templateCode,
    keccak256(toBytes(input.resourceId)),
    keccak256(toBytes(input.title)),
    keccak256(toBytes(input.description)),
    amountUsdcUnits,
    recipient,
    scheduleHash,
    BigInt(input.durationSeconds),
    BigInt(input.cancellationWindowSeconds),
  ]))
  return {
    version: 1 as const,
    termsHash,
    templateCode,
    amountUsdcUnits: amountUsdcUnits.toString(),
    recipient,
    cumulativeReleaseBps,
    durationSeconds: input.durationSeconds,
    cancellationWindowSeconds: input.cancellationWindowSeconds,
  }
}

export function arcAgreementClientReference(partnerId: string, agreementId: string) {
  return keccak256(encodeAbiParameters(CLIENT_REFERENCE_ABI, [
    CLIENT_REFERENCE_DOMAIN,
    keccak256(toBytes(partnerId)),
    keccak256(toBytes(agreementId)),
  ]))
}

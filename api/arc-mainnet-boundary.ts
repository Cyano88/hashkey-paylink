/** Arc mainnet identity. Never accept retired testnet stores or credentials. */
export const ARC_MAINNET_CHAIN_ID = 5042
export const ARC_MAINNET_CIRCLE_CHAIN = 'ARC'

export function arcMainnetStoreKey(name: string, override?: string): string {
  const key = override?.trim() || `hashpaylink:arc-mainnet:5042:${name}:v1`
  if (!key.startsWith('hashpaylink:arc-mainnet:5042:')) {
    throw new Error('Arc mainnet storage must use the isolated hashpaylink:arc-mainnet:5042: namespace.')
  }
  return key
}

export function requireArcMainnetCircleKey(value: unknown): string {
  const key = String(value ?? '').trim()
  if (!/^LIVE_API_KEY:[^:\s]+:[^:\s]+$/.test(key)) {
    throw new Error('A Circle production LIVE_API_KEY is required for Arc mainnet.')
  }
  return key
}

// Internally reviewed deployment; exact deployed source commit: 36ded4e52.
// Deployment identity does not enable execution: runtime and project gates remain.
// Evidence: docs/audits/ARC_MAINNET_DEPLOYMENT_VERIFIED_2026-09-24.md.
export const ARC_MAINNET_AGREEMENT_RELEASE: Readonly<{
  chainId: number; factory: `0x${string}`; operator: `0x${string}`
}> | null = Object.freeze({
  chainId: 5042,
  factory: '0x161b94A03fB2880902f69dA42d23C1c9043412Bc',
  operator: '0x988192DCc9f6F58d6BF9CF2D31697F5029F8a436',
})

export function requireArcMainnetAgreementRelease(): Readonly<{ chainId: number; factory: `0x${string}`; operator: `0x${string}` }> {
  if (!ARC_MAINNET_AGREEMENT_RELEASE) {
    throw new Error('Arc mainnet Agreement deployment has not been reviewed; activation remains disabled.')
  }
  return ARC_MAINNET_AGREEMENT_RELEASE
}

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

// No mainnet Agreement factory/operator deployment has been reviewed yet.
// Populating this requires a separately reviewed deployment, not an env override.
export const ARC_MAINNET_AGREEMENT_RELEASE: Readonly<{
  chainId: number; factory: `0x${string}`; operator: `0x${string}`
}> | null = null

export function requireArcMainnetAgreementRelease(): Readonly<{ chainId: number; factory: `0x${string}`; operator: `0x${string}` }> {
  if (!ARC_MAINNET_AGREEMENT_RELEASE) {
    throw new Error('Arc mainnet Agreement deployment has not been reviewed; activation remains disabled.')
  }
  return ARC_MAINNET_AGREEMENT_RELEASE
}

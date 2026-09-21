export type PocketKycCountry = 'NG' | 'KE' | 'RW'
export type PocketKycProvider = 'smile' | 'sumsub'
export type PocketKycContext = { country?: string; provider?: string; policyVersion?: string }

// Adding a country or provider is not launch approval. Only the implemented,
// explicitly configured policy can create sessions or grant eligibility.
export const POCKET_KYC_MARKETS = {
  NG: { name: 'Nigeria', identityStatus: 'configured', limitUpgradeStatus: 'planned' },
  KE: { name: 'Kenya', identityStatus: 'planned', limitUpgradeStatus: 'planned' },
  RW: { name: 'Rwanda', identityStatus: 'planned', limitUpgradeStatus: 'planned' },
} as const
const NIGERIA_POLICY = {
  country: 'NG' as const, countryName: 'Nigeria', provider: 'smile' as const,
  policyVersion: 'ng-smile-bvn-v1',
  idSelection: { NG: ['BVN_MFA'] }, consentRequired: { NG: ['BVN_MFA'] },
  previewBVNMFA: true,
}
const unavailable = () => Object.assign(new Error('Identity verification is not available for this country yet.'), { status: 409 })

export function startKycPolicy(country: unknown = 'NG') {
  if (typeof country !== 'string' || !Object.hasOwn(POCKET_KYC_MARKETS, country)) {
    throw Object.assign(new Error('Unsupported verification country.'), { status: 400 })
  }
  if (country !== 'NG') throw unavailable()
  return structuredClone(NIGERIA_POLICY)
}

export function storedKycPolicy(context?: PocketKycContext) {
  // Records created before country metadata existed were Nigeria/Smile only.
  const country = context?.country ?? 'NG'
  const provider = context?.provider ?? 'smile'
  const version = context?.policyVersion ?? NIGERIA_POLICY.policyVersion
  if (country !== 'NG' || provider !== 'smile' || version !== NIGERIA_POLICY.policyVersion) throw unavailable()
  return structuredClone(NIGERIA_POLICY)
}

export function matchesKycPolicy(context: PocketKycContext, resultCountry: string) {
  try { return storedKycPolicy(context).country === resultCountry } catch { return false }
}

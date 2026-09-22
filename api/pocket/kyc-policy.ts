export type PocketKycCountry = 'NG' | 'KE' | 'RW'
export type PocketKycMethod = 'bvn' | 'nin' | 'government_id'
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
  policyVersion: 'ng-smile-bvn-v2',
  idSelection: { NG: ['BVN_MFA'] }, consentRequired: { NG: ['BVN_MFA'] },
  previewBVNMFA: true,
  method: 'bvn' as PocketKycMethod, product: 'biometric_kyc', jobType: '1',
}
const LEGACY_BVN_POLICY = { ...NIGERIA_POLICY, policyVersion: 'ng-smile-bvn-v1' }
const additionalPolicies = {
  nin: { ...NIGERIA_POLICY, method: 'nin' as PocketKycMethod, policyVersion: 'ng-smile-nin-v1', idSelection: { NG: ['NIN_V2'] }, consentRequired: { NG: ['NIN_V2'] }, previewBVNMFA: false },
  government_id: { ...NIGERIA_POLICY, method: 'government_id' as PocketKycMethod, policyVersion: 'ng-smile-document-v1', product: 'doc_verification', jobType: '6', idSelection: { NG: ['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID'] }, consentRequired: { NG: [] }, previewBVNMFA: false },
}
const unavailable = () => Object.assign(new Error('Identity verification is not available for this country yet.'), { status: 409 })

export function startKycPolicy(country: unknown = 'NG', method: unknown = 'bvn') {
  if (typeof country !== 'string' || !Object.hasOwn(POCKET_KYC_MARKETS, country)) {
    throw Object.assign(new Error('Unsupported verification country.'), { status: 400 })
  }
  if (country !== 'NG') throw unavailable()
  if (!['bvn', 'nin', 'government_id'].includes(String(method))) throw Object.assign(new Error('Choose a supported verification method.'), { status: 400 })
  if (method !== 'bvn') return structuredClone(additionalPolicies[method as keyof typeof additionalPolicies])
  return structuredClone(NIGERIA_POLICY)
}

export function storedKycPolicy(context?: PocketKycContext) {
  // Records created before country metadata existed were Nigeria/Smile only.
  const country = context?.country ?? 'NG'
  const provider = context?.provider ?? 'smile'
  const version = context?.policyVersion ?? LEGACY_BVN_POLICY.policyVersion
  if (country !== 'NG' || provider !== 'smile') throw unavailable()
  if (version === LEGACY_BVN_POLICY.policyVersion) return structuredClone(LEGACY_BVN_POLICY)
  for (const policy of Object.values(additionalPolicies)) if (version === policy.policyVersion) return structuredClone(policy)
  if (version !== NIGERIA_POLICY.policyVersion) throw unavailable()
  return structuredClone(NIGERIA_POLICY)
}

export function matchesKycPolicy(context: PocketKycContext, resultCountry: string) {
  try { return storedKycPolicy(context).country === resultCountry } catch { return false }
}

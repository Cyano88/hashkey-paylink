export type LocalCurrencyProfile = {
  firstName: string
  lastName: string
  resolvedName: string
  kycLevel?: 'none' | 'basic' | 'advanced'
  kycCountry?: 'NG' | 'UG'
  declaredName?: string
  nameStatus: 'unverified' | 'bank_resolved' | 'kyc_verified'
  email: string
  pocketNumber: string
  pocketId: string
  avatarId: number
  displayCurrency: 'USDC' | 'NGN' | 'UGX'
  updatedAt?: string
}

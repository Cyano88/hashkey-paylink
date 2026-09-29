export type LocalCurrencyProfile = {
  firstName: string
  lastName: string
  resolvedName: string
  nameStatus: 'unverified' | 'bank_resolved' | 'kyc_verified'
  email: string
  pocketNumber: string
  pocketId: string
  avatarId: number
  displayCurrency: 'USDC' | 'NGN' | 'GHS' | 'KES'
  updatedAt?: string
}

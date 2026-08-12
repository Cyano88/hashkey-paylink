export type LocalCurrencyProfile = {
  firstName: string
  lastName: string
  resolvedName: string
  nameStatus: 'unverified' | 'bank_resolved'
  email: string
  pocketNumber: string
  pocketId: string
  avatarId: number
  updatedAt?: string
}

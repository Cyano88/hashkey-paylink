export type PocketEsimPlan = {
  id: string
  title: string
  data: string
  daily?: boolean
  coverage?: string[]
  days: number
  operator: string
  topUp: boolean
  fairUsage: string
  activation: string
}

export type PocketEsimDestination = {
  id: string
  name: string
  countryCode: string
  region: boolean
  plans: PocketEsimPlan[]
}

// Catalog access does not enable charging or provisioning.
export type PocketEsimCatalog = {
  status: 'coming_soon' | 'available'
  purchaseEnabled: false
  destinations: PocketEsimDestination[]
}

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

export type PocketEsimPrice = { subtotal: string; platformFee: string; total: string; currency: 'USD'; days: number }

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
  purchaseEnabled: boolean
  destinations: PocketEsimDestination[]
}

export type PocketEsimOrder = {
  id: string; state: 'quoted' | 'awaiting_payment' | 'payment_failed' | 'payment_received' | 'ordering' | 'order_unknown' | 'provisioning' | 'ready' | 'needs_review' | 'refund_eligible' | 'refunding' | 'refunded'; packageCode: string; days: number; asset: 'USDC' | 'USDT'; network: 'base'
  price: PocketEsimPrice; createdAt: number; expiresAt: number; txHash: string; refundTxHash: string
  networkFee?: string; totalDebit?: string
  packageLabel?: string
}

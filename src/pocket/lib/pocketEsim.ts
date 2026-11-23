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

export function pocketEsimAllowanceLabel(plan: Pick<PocketEsimPlan, 'data' | 'daily'>): string {
  const amount = plan.data.replace(/\s*\/\s*day$/i, '').trim()
  return amount + (plan.daily ? ' per day' : ' total')
}

// Pocket Cash is backed by Base USDC; preserve USDT for accurate legacy receipts.
export function pocketEsimDisplayCurrency(asset: 'USDC' | 'USDT'): 'USD' | 'USDT' {
  return asset === 'USDC' ? 'USD' : 'USDT'
}

export function pocketEsimPaymentLabel(asset: 'USDC' | 'USDT'): 'Cash balance' | 'USDT' {
  return asset === 'USDC' ? 'Cash balance' : 'USDT'
}

export function pocketEsimErrorMessage(message: string): string {
  const shortfall = message.match(/^Add\s+([\d,]+(?:\.\d+)?)\s+USDC\s+to cover this send and fees\.?$/i)
  return shortfall ? 'Add USD ' + shortfall[1] + ' to your Cash balance to cover this payment and fees.' : message
}
export type PocketEsimPrice = { subtotal: string; platformFee: string; total: string; currency: 'USD'; days: number }

export type PocketEsimDestination = {
  id: string
  name: string
  countryCode: string
  region: boolean
  plans: PocketEsimPlan[]
}

export type PocketEsimTopUpPlan = PocketEsimPlan & { price: PocketEsimPrice }
export type PocketEsimTopUpDestination = Omit<PocketEsimDestination, 'plans'> & { plans: PocketEsimTopUpPlan[] }

// Catalog access does not enable charging or provisioning.
export type PocketEsimCatalog = {
  status: 'coming_soon' | 'available'
  purchaseEnabled: boolean
  destinations: PocketEsimDestination[]
}

export type PocketEsimOrder = {
  id: string; state: 'quoted' | 'awaiting_payment' | 'payment_failed' | 'payment_received' | 'ordering' | 'order_unknown' | 'provisioning' | 'ready' | 'needs_review' | 'refund_eligible' | 'refunding' | 'refunded'; packageCode: string; days: number; asset: 'USDC' | 'USDT'; network: 'base'
  price: PocketEsimPrice; createdAt: number; expiresAt: number; txHash: string; refundTxHash: string; topUpFor?: string
  networkFee?: string; totalDebit?: string
  packageLabel?: string
}

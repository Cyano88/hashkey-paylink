/** Product contract only. Listing a route does not activate financial execution. */
export const MARKETPLACE_PAYMENTS = {
  capability: 'marketplace_payments',
  title: 'Marketplace Payments',
  status: 'under_development',
  network: 'base',
  assets: ['USDC', 'USDT'],
  docsPath: '/docs/marketplaces',
} as const

export const MARKETPLACE_SETTLEMENTS = [
  {id: 'cash_balance', title: 'Bank account settlement', label: 'Cash balance', asset: 'USDC', currency: 'NGN', destination: 'Verified bank account', detail: 'USDC funds an NGN payout through the Paycrest quote and settlement flow.'},
  {id: 'wallet_usdc', title: 'Wallet settlement', label: 'USDC on Base', asset: 'USDC', currency: 'USDC', destination: 'Verified Base wallet', detail: 'Release USDC to the seller\'s wallet on Base.'},
  {id: 'wallet_usdt', title: 'Wallet settlement', label: 'USDT on Base', asset: 'USDT', currency: 'USDT', destination: 'Verified Base wallet', detail: 'Release USDT to the seller\'s wallet on Base. Local settlement is not supported.'},
] as const

export type MarketplaceAsset = typeof MARKETPLACE_PAYMENTS.assets[number]
export type MarketplaceSettlementId = typeof MARKETPLACE_SETTLEMENTS[number]['id']
export function marketplaceSettlement(id: string, asset: string, network: string) {
  const route = MARKETPLACE_SETTLEMENTS.find(route => route.id === id)
  if (!route || network !== 'base' || route.asset !== asset) throw Error('Settlement must match the payment asset on Base. Automatic conversion is not supported.')
  return route
}

/** Integer micro-units, never rounded display strings or floating-point math. */
export function marketplaceAmountUnits(amount: string): string {
  if (typeof amount !== 'string' || !/^(0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(amount)) throw Error('Use a decimal amount with at most six decimal places.')
  const [whole, fraction = ''] = amount.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n) throw Error('Amount must be positive.')
  return units.toString()
}

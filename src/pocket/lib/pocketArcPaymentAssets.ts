// Canonical Arc payment assets. Additions require verified contracts and swap routes.
export const ARC_PAYMENT_ASSETS = [
  { address: '0x3600000000000000000000000000000000000000', symbol: 'USDC', decimals: 6 },
  { address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1', symbol: 'EURC', decimals: 6 },
] as const

export function isArcPaymentAddress(address: string): boolean {
  return ARC_PAYMENT_ASSETS.some(asset => asset.address.toLowerCase() === address.toLowerCase())
}

export function curatedArcPaymentTokens<T extends { address: string; symbol: string; decimals: number }>(tokens: T[]): T[] {
  return ARC_PAYMENT_ASSETS.flatMap(asset => {
    const token = tokens.find(item => item.address.toLowerCase() === asset.address.toLowerCase()
      && item.symbol === asset.symbol && item.decimals === asset.decimals)
    return token ? [token] : []
  })
}

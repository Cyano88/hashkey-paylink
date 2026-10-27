import { getAddress, isAddress } from 'viem'
import { checkoutStablecoins } from './checkoutStablecoins.js'

export type BscCheckoutConfig = { recipient: string; assets: string[] }
// Checkout acceptance is intentionally narrower than Pocket trading/holdings.
// Add a stablecoin only after its checkout execution and reconciliation are verified.
export const bscCheckoutAssets = checkoutStablecoins('bsc')
export const isBscCheckoutAsset = (address: string) => bscCheckoutAssets.some(asset => asset.address.toLowerCase() === address.toLowerCase())
export function currentBscCheckoutConfig(value?: BscCheckoutConfig): BscCheckoutConfig | undefined {
  if (!value) return undefined
  const assets = value.assets.filter(isBscCheckoutAsset)
  return assets.length ? { ...value, assets } : undefined
}
export function normalizeBscCheckoutConfig(value: unknown): BscCheckoutConfig | undefined {
  if (value === undefined || value === null) return undefined
  const input = value as BscCheckoutConfig
  if (!isAddress(input.recipient) || /^0x0{40}$/i.test(input.recipient) || !Array.isArray(input.assets) || !input.assets.length || input.assets.length > bscCheckoutAssets.length) throw Error('Choose an BNB Chain receiving address and supported stablecoins.')
  const assets = [...new Set(input.assets.map(address => String(address).toLowerCase()))]
  if (assets.some(address => !isBscCheckoutAsset(address))) throw Error('Checkout accepts supported stablecoins only. Choose USDC or USDT on BNB Chain.')
  return { recipient: getAddress(input.recipient), assets }
}

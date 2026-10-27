import { getAddress, isAddress } from 'viem'
import { checkoutStablecoins } from './checkoutStablecoins.js'

export type XLayerCheckoutConfig = { recipient: string; assets: string[] }
// Checkout acceptance is intentionally narrower than Pocket trading/holdings.
// Add a stablecoin only after its checkout execution and reconciliation are verified.
export const xlayerCheckoutAssets = checkoutStablecoins('xlayer')
export const isXLayerCheckoutAsset = (address: string) => xlayerCheckoutAssets.some(asset => asset.address.toLowerCase() === address.toLowerCase())
export function currentXLayerCheckoutConfig(value?: XLayerCheckoutConfig): XLayerCheckoutConfig | undefined {
  if (!value) return undefined
  const assets = value.assets.filter(isXLayerCheckoutAsset)
  return assets.length ? { ...value, assets } : undefined
}
export function normalizeXLayerCheckoutConfig(value: unknown): XLayerCheckoutConfig | undefined {
  if (value === undefined || value === null) return undefined
  const input = value as XLayerCheckoutConfig
  if (!isAddress(input.recipient) || /^0x0{40}$/i.test(input.recipient) || !Array.isArray(input.assets) || !input.assets.length || input.assets.length > xlayerCheckoutAssets.length) throw Error('Choose an X Layer receiving address and supported stablecoins.')
  const assets = [...new Set(input.assets.map(address => String(address).toLowerCase()))]
  if (assets.some(address => !isXLayerCheckoutAsset(address))) throw Error('Checkout accepts supported stablecoins only. Choose USDC, USDT, USDe or USDG on X Layer.')
  return { recipient: getAddress(input.recipient), assets }
}

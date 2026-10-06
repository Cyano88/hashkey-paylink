import { getAddress, isAddress } from 'viem'
import catalogue from '../pocket/lib/pocketXStocksCatalog.json'
import { stockUsdc } from '../pocket/lib/pocketXStocksWallet.js'

export type XLayerCheckoutConfig = { recipient: string; assets: string[] }
export const xlayerCheckoutAssets = [stockUsdc, ...catalogue.assets]
export function normalizeXLayerCheckoutConfig(value: unknown): XLayerCheckoutConfig | undefined {
  if (value === undefined || value === null) return undefined
  const input = value as XLayerCheckoutConfig
  if (!isAddress(input.recipient) || /^0x0{40}$/i.test(input.recipient) || !Array.isArray(input.assets) || !input.assets.length || input.assets.length > 20) throw Error('Choose an X Layer receiving address and up to 20 accepted assets.')
  const assets = [...new Set(input.assets.map(address => String(address).toLowerCase()))]
  if (assets.some(address => !xlayerCheckoutAssets.some(asset => asset.address.toLowerCase() === address))) throw Error('Choose supported X Layer checkout assets.')
  return { recipient: getAddress(input.recipient), assets }
}

import { CHAIN_META } from './chains'
import { POCKET_USDT_ASSETS } from '../pocket/lib/pocketUsdtAssets'
import { POCKET_EURC } from '../pocket/lib/pocketEurc'
import { POCKET_BSC } from '../pocket/lib/pocketBsc'
import { xLayerFeeAssets } from '../pocket/lib/pocketXLayerFeeAssets'

// Canonical identity only: presence here does not enable a checkout execution route.
export const CHECKOUT_NETWORK_ORDER = ['base', 'arc', 'xlayer', 'arbitrum', 'solana', 'bsc', 'ethereum', 'polygon'] as const
export type CheckoutStablecoinNetwork = typeof CHECKOUT_NETWORK_ORDER[number]
export type CheckoutStablecoinSymbol = 'USDC' | 'USDT' | 'USDe' | 'USDG' | 'EURC'
export type CheckoutStablecoin = { network: CheckoutStablecoinNetwork; chainId: number | null; symbol: CheckoutStablecoinSymbol; address: string; decimals: number; currency: 'USD' | 'EUR' }
export const CHECKOUT_STABLECOINS: readonly CheckoutStablecoin[] = CHECKOUT_NETWORK_ORDER.flatMap(network => {
  if (network === 'xlayer') return Object.entries(xLayerFeeAssets).map(([symbol, token]) => ({network, chainId:196, symbol:symbol as CheckoutStablecoinSymbol, ...token, currency:'USD' as const}))
  if (network === 'bsc') return (['USDC','USDT'] as const).map(symbol => ({network, chainId:56, ...POCKET_BSC.assets[symbol], currency:'USD' as const}))
  const meta = CHAIN_META[network]
  const chainId = 'chainId' in meta ? meta.chainId : null
  const assets: CheckoutStablecoin[] = [{network,chainId,symbol:'USDC',address:meta.tokenAddress,decimals:6,currency:'USD'}]
  if (Object.hasOwn(POCKET_USDT_ASSETS,network)) assets.push({network,symbol:'USDT',...POCKET_USDT_ASSETS[network as keyof typeof POCKET_USDT_ASSETS],currency:'USD'})
  if (network === 'base' || network === 'arc') assets.push({network,chainId,...POCKET_EURC[network],currency:'EUR'})
  return assets
})
export function checkoutStablecoin(network:string, identity:string):CheckoutStablecoin|undefined {
  return CHECKOUT_STABLECOINS.find(asset => asset.network === network && (asset.symbol === identity || (network === 'solana' ? asset.address === identity : asset.address.toLowerCase() === identity.toLowerCase())))
}
export function checkoutStablecoins(network:string) { return CHECKOUT_STABLECOINS.filter(asset => asset.network === network) }

import {CHECKOUT_NETWORK_ORDER,checkoutStablecoins} from '../../lib/checkoutStablecoins'
export const XPAY_COINS=['USDC','USDT','USDe','USDG'] as const
export type XPayCoin=typeof XPAY_COINS[number]
export const XPAY_NETWORK_NAMES:Record<string,string>={base:'Base',arc:'Arc',xlayer:'X Layer',arbitrum:'Arbitrum',solana:'Solana',bsc:'BNB Chain',ethereum:'Ethereum',polygon:'Polygon'}
export function xpayCoinNetworks(coin:XPayCoin){return CHECKOUT_NETWORK_ORDER.filter(network=>checkoutStablecoins(network).some(token=>token.symbol===coin))}
// Catalogue visibility is not execution permission. Existing XPay payments use
// the USDC POS adapter; hosted X Layer/BNB and other assets need their own adapter.
export function xpayCoinExecutable(coin:XPayCoin,network:string){return coin==='USDC'&&['base','arc','arbitrum','solana','ethereum','polygon'].includes(network)}

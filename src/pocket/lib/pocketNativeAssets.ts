/** Native assets are holdings, never payment or cross-chain bridge currencies. */
export const POCKET_NATIVE_ASSETS = {
  ETH: {symbol:'ETH', decimals:18, icon:'/brand/ethereum-logo.png', networks:['ethereum','base','arbitrum']},
  OKB: {symbol:'OKB', decimals:18, icon:'/brand/okb.png', networks:['xlayer']},
  POL: {symbol:'POL', decimals:18, icon:'/brand/polygon-logo.png', networks:['polygon']},
  SOL: {symbol:'SOL', decimals:9, icon:'/brand/solana-logo.jpeg', networks:['solana']},
} as const
export type PocketNativeSymbol = keyof typeof POCKET_NATIVE_ASSETS
export type PocketNativeNetwork = 'ethereum'|'base'|'arbitrum'|'xlayer'|'polygon'|'solana'
export function pocketNativeAsset(symbol:string) {
  return Object.prototype.hasOwnProperty.call(POCKET_NATIVE_ASSETS,symbol) ? POCKET_NATIVE_ASSETS[symbol as PocketNativeSymbol] : undefined
}
export function pocketNativeOnNetwork(network:string) {
  return Object.values(POCKET_NATIVE_ASSETS).find(asset=>(asset.networks as readonly string[]).includes(network))
}
export function pocketAssetActionAllowed(symbol:string,network:string,action:'payment'|'bridge'|'stock'|'hold'|'deposit') {
  if(symbol==='USDC'||symbol==='USDT')return ['base','arbitrum','ethereum','polygon','solana','xlayer',...(symbol==='USDC'?['arc']:[])].includes(network)
  const native=pocketNativeAsset(symbol)
  if(!native||!(native.networks as readonly string[]).includes(network))return false
  return action==='hold'||action==='deposit'||(action==='stock'&&symbol==='OKB'&&network==='xlayer')
}
// Preview only until native sending and conversion pass funded device checks.
export const pocketNativeAssetsEnabled = import.meta.env?.VITE_POCKET_NATIVE_ASSETS === 'true'
export type PocketNativeBalance = {network:Exclude<PocketNativeNetwork,'xlayer'>;symbol:PocketNativeSymbol;address:string|null;quantity:number|null;valueUsd:number|null;observedAt:number;status:'ok'|'error'}

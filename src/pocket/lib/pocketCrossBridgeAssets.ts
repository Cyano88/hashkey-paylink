import {CHAIN_META} from '../../lib/chains'
import {POCKET_USDT_ASSETS} from './pocketUsdtAssets'
import {POCKET_BSC} from './pocketBsc'
import {POCKET_EURC} from './pocketEurc'
import {xLayerUsde,xLayerUsdg} from './pocketXLayerPaymentAssets'

export const CROSS_BRIDGE_NETWORKS=['ethereum','base','arbitrum','polygon','solana','arc','bsc','xlayer'] as const
export type CrossBridgeNetwork=typeof CROSS_BRIDGE_NETWORKS[number]
export type CrossBridgeAsset={symbol:string;address:string;decimals:number;native:boolean}
export const CROSS_BRIDGE_NATIVE_ADDRESS='0x0000000000000000000000000000000000000000'
export function crossBridgeNetwork(value:unknown):CrossBridgeNetwork {
 if(typeof value!=='string'||!(CROSS_BRIDGE_NETWORKS as readonly string[]).includes(value))throw Error('Choose a supported bridge network.')
 return value as CrossBridgeNetwork
}
/** Eligibility only; a validated provider quote and execution support are also required. */
export function crossBridgeAssets(network:CrossBridgeNetwork):CrossBridgeAsset[] {
 crossBridgeNetwork(network)
 if(network==='bsc')return Object.values(POCKET_BSC.assets).map(a=>({...a,address:a.native?CROSS_BRIDGE_NATIVE_ADDRESS:a.address}))
 if(network==='xlayer')return [
  {symbol:'OKB',address:CROSS_BRIDGE_NATIVE_ADDRESS,decimals:18,native:true},
  {symbol:'USDC',address:'0xb6ceceab302e2e4948951ee7843fc24e92933061',decimals:6,native:false},
  {symbol:'USDT',address:'0x779ded0c9e1022225f8e0630b35a9b54be713736',decimals:6,native:false},
  {...xLayerUsde,native:false},{...xLayerUsdg,native:false}]
 const stablecoins:CrossBridgeAsset[]=[{symbol:'USDC',address:CHAIN_META[network].tokenAddress,decimals:6,native:false}]
 if(network!=='arc')stablecoins.push({symbol:'USDT',...POCKET_USDT_ASSETS[network],native:false})
 if(network==='base'||network==='arc')stablecoins.push({...POCKET_EURC[network]})
 // Native SOL and POL are excluded, not their networks. Arc uses ERC-20 USDC here.
 return ['ethereum','base','arbitrum'].includes(network)?[{symbol:'ETH',address:CROSS_BRIDGE_NATIVE_ADDRESS,decimals:18,native:true},...stablecoins]:stablecoins
}
export function crossBridgeAsset(network:CrossBridgeNetwork,symbol:string):CrossBridgeAsset {
 const token=crossBridgeAssets(network).find(a=>a.symbol===symbol)
 if(!token)throw Error('Choose a supported bridge asset on this network.')
 return token
}
export function crossBridgePair(source:CrossBridgeNetwork,destination:CrossBridgeNetwork,from:string,to:string){
 if(crossBridgeNetwork(source)===crossBridgeNetwork(destination))throw Error('Choose different bridge networks.')
 return {tokenIn:crossBridgeAsset(source,from),tokenOut:crossBridgeAsset(destination,to)}
}

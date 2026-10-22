import {CHAIN_META} from '../../lib/chains'
import {POCKET_USDT_ASSETS} from './pocketUsdtAssets'
import {pocketNativeOnNetwork} from './pocketNativeAssets'
export const NATIVE_SWAP_NETWORKS=['ethereum','base','arbitrum','polygon','solana'] as const
export type NativeSwapNetwork=typeof NATIVE_SWAP_NETWORKS[number]
export type NativeSwapAsset={symbol:string;address:string;decimals:number;native:boolean}
export function nativeSwapNetwork(value:unknown):NativeSwapNetwork{
 if(typeof value!=='string'||!(NATIVE_SWAP_NETWORKS as readonly string[]).includes(value))throw Error('Choose a supported swap network.')
 return value as NativeSwapNetwork
}
export function nativeSwapAssets(network:NativeSwapNetwork):NativeSwapAsset[]{
 nativeSwapNetwork(network)
 const native=pocketNativeOnNetwork(network)!
 return [{symbol:native.symbol,address:network==='solana'?'11111111111111111111111111111111':'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',decimals:native.decimals,native:true},
 {symbol:'USDC',address:CHAIN_META[network].tokenAddress,decimals:6,native:false},
 {symbol:'USDT',address:POCKET_USDT_ASSETS[network].address,decimals:6,native:false}]
}
export function nativeSwapPair(network:NativeSwapNetwork,from:string,to:string){
 const assets=nativeSwapAssets(network),tokenIn=assets.find(a=>a.symbol===from),tokenOut=assets.find(a=>a.symbol===to)
 if(!tokenIn||!tokenOut||tokenIn.symbol===tokenOut.symbol)throw Error('Choose two different supported assets.')
 return {tokenIn,tokenOut}
}

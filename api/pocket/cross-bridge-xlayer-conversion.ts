import {encodeFunctionData,formatUnits,getAddress,parseAbi} from 'viem'
import {quoteXLayerConversionSwap,quoteXLayerBridgeSwap} from './xstocks-swap-provider.js'
import {validateStockSwap,validateXLayerBridgeSwap,OKX_XLAYER_SPENDER,type StockSwapQuote} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import type {CrossBridgeInput} from './cross-bridge-provider.js'
const abi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
export function validateXLayerConversion(swap:StockSwapQuote,input:CrossBridgeInput,now:number){
 const fail=():never=>{throw Error('X Layer conversion does not match this bridge review.')}
 if(input.source!=='xlayer'||input.from==='USDC')return fail()
 const token=crossBridgeAsset('xlayer',input.from),bridgeToken=crossBridgeAsset('xlayer','USDC')
 if(input.from==='USDT')validateXLayerBridgeSwap(swap,getAddress(input.sender),now)
 else validateStockSwap(swap,getAddress(input.sender),now)
 if(swap.tokenIn.address.toLowerCase()!==(token.native?'native':token.address.toLowerCase())||swap.tokenOut.address.toLowerCase()!==bridgeToken.address.toLowerCase()||swap.decimalsIn!==token.decimals||swap.decimalsOut!==6||swap.amountUnits!==input.amountUnits||swap.serviceFee)return fail()
 const approve=(value:bigint)=>({target:getAddress(token.address),value:0n,data:encodeFunctionData({abi,functionName:'approve',args:[getAddress(OKX_XLAYER_SPENDER),value]})})
 const call={target:getAddress(swap.tx.to),value:BigInt(swap.tx.value),data:swap.tx.data}
 return {calls:token.native?[call]:[approve(0n),approve(BigInt(input.amountUnits)),call,approve(0n)],minimumUnits:swap.minimumOutUnits,expiresAt:swap.expiresAt,spendRecipient:swap.tx.to,bridgeToken}
}
export async function quoteXLayerConversion(input:CrossBridgeInput){
 const token=crossBridgeAsset('xlayer',input.from),amount=formatUnits(BigInt(input.amountUnits),token.decimals),owner=getAddress(input.sender)
 const swap=input.from==='USDT'?await quoteXLayerBridgeSwap({owner,amount}):await quoteXLayerConversionSwap({owner,amount,tokenIn:token.native?'native':token.address,tokenOut:crossBridgeAsset('xlayer','USDC').address})
 validateXLayerConversion(swap,input,Date.now());return swap
}

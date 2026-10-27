import {xLayerFeeAssets,type XLayerFeeAsset} from './pocketXLayerFeeAssets'
import {encodeFunctionData,parseAbi,type Hex} from 'viem'
import {stockUsdc,stockUsdt,stockUsde,stockUsdg,stockAssets} from './pocketXStocksWallet'
import {validateStockSwap,type StockSwapQuote} from './pocketXStocksSwap'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees'
import {makeSponsoredBatchRequest} from './pocketSponsoredRequest'
const approve=parseAbi(['function approve(address,uint256) returns(bool)'])
const transfer=parseAbi(['function transfer(address,uint256) returns(bool)'])
export type SponsoredSwapReview={feeToken:string;feeUnits:string;totalUnits:string;expiresAt:number;request:ReturnType<typeof makeSponsoredBatchRequest>}
export function reimbursedSwapAsset(q:StockSwapQuote){return (q.tokenOut.address==='native'||[stockUsdc.address.toLowerCase(),stockUsdt.address.toLowerCase(),stockUsde.address.toLowerCase(),stockUsdg.address.toLowerCase()].includes(q.tokenOut.address.toLowerCase())||stockAssets.some(a=>a.address.toLowerCase()===q.tokenOut.address.toLowerCase()))&&Object.entries(xLayerFeeAssets).some(([symbol,token])=>symbol===q.tokenIn.symbol&&token.address===q.tokenIn.address.toLowerCase()&&token.decimals===q.decimalsIn)?q.tokenIn.symbol as XLayerFeeAsset:undefined}
export function sponsoredSwapCalls(q:StockSwapQuote){
 validateStockSwap(q,q.owner)
 if(!reimbursedSwapAsset(q)||q.tx.value!=='0')throw Error('Unsupported sponsored swap.')
 const allowance=(units:bigint)=>({to:q.tokenIn.address as Hex,value:'0x0' as const,data:encodeFunctionData({abi:approve,functionName:'approve',args:[q.spender,units]})})
 return [allowance(0n),allowance(BigInt(q.amountUnits)),{to:q.tx.to,value:'0x0' as const,data:q.tx.data},allowance(0n)]
}
export function validateSponsoredSwap(q:StockSwapQuote,s:SponsoredSwapReview){
 const calls=sponsoredSwapCalls(q),walletId=s.request?.url?.match(/^https:\/\/api\.privy\.io\/v1\/wallets\/([a-zA-Z0-9]{10,64})\/rpc$/)?.[1],appId=s.request?.headers?.['privy-app-id']
 if(!walletId||!appId||!s.feeToken||s.feeToken.length>60000||!/^\d+$/.test(s.feeUnits)||BigInt(s.feeUnits)<=0n||!/^\d+$/.test(s.totalUnits)||BigInt(s.totalUnits)!==BigInt(q.amountUnits)+BigInt(s.feeUnits)||!Number.isSafeInteger(s.expiresAt)||s.expiresAt<=Date.now()||s.expiresAt>q.expiresAt)throw Error('Swap fee changed. Review the swap again.')
 const expected=makeSponsoredBatchRequest({appId,walletId,attemptId:q.id,expiresAt:s.expiresAt,calls:[...calls,{to:q.tokenIn.address,data:encodeFunctionData({abi:transfer,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,BigInt(s.feeUnits)]}),value:'0x0'}]})
 const canonical=(v:unknown)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
 if(canonical(s.request)!==canonical(expected))throw Error('Swap authorization changed.')
}

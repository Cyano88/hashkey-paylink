import {formatPocketAssetAmount} from './pocketAmountDisplay'
import {xLayerFeeAssets,type XLayerFeeAsset} from './pocketXLayerFeeAssets'
import {encodeFunctionData,parseAbi,formatUnits,parseUnits,type Hex} from 'viem'
import {stockUsdc,stockUsdt,stockUsde,stockUsdg,stockAssets} from './pocketXStocksWallet'
import {validateStockSwap,type StockSwapQuote} from './pocketXStocksSwap'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees'
import {makeSponsoredBatchRequest} from './pocketSponsoredRequest'
const approve=parseAbi(['function approve(address,uint256) returns(bool)'])
const transfer=parseAbi(['function transfer(address,uint256) returns(bool)'])
export type SponsoredSwapReview={feeToken:string;feeUnits:string;totalUnits:string;expiresAt:number;request:ReturnType<typeof makeSponsoredBatchRequest>}
export function stockSaleReimbursement(q:StockSwapQuote){return stockAssets.some(a=>a.address.toLowerCase()===q.tokenIn.address.toLowerCase()&&a.symbol===q.tokenIn.symbol)&&q.tokenOut.address.toLowerCase()===stockUsdc.address.toLowerCase()&&q.tokenOut.symbol==='USDC'&&q.decimalsOut===6}
export function reimbursedSwapAsset(q:StockSwapQuote){return stockSaleReimbursement(q)?'USDC':(q.tokenOut.address==='native'||[stockUsdc.address.toLowerCase(),stockUsdt.address.toLowerCase(),stockUsde.address.toLowerCase(),stockUsdg.address.toLowerCase()].includes(q.tokenOut.address.toLowerCase())||stockAssets.some(a=>a.address.toLowerCase()===q.tokenOut.address.toLowerCase()))&&Object.entries(xLayerFeeAssets).some(([symbol,token])=>symbol===q.tokenIn.symbol&&token.address===q.tokenIn.address.toLowerCase()&&token.decimals===q.decimalsIn)?q.tokenIn.symbol as XLayerFeeAsset:undefined}
export function sponsoredSwapCalls(q:StockSwapQuote){
 validateStockSwap(q,q.owner)
 if(!reimbursedSwapAsset(q)||q.tx.value!=='0')throw Error('Unsupported sponsored swap.')
 const allowance=(units:bigint)=>({to:q.tokenIn.address as Hex,value:'0x0' as const,data:encodeFunctionData({abi:approve,functionName:'approve',args:[q.spender,units]})})
 return [allowance(0n),allowance(BigInt(q.amountUnits)),{to:q.tx.to,value:'0x0' as const,data:q.tx.data},allowance(0n)]
}
export function validateSponsoredSwap(q:StockSwapQuote,s:SponsoredSwapReview){
 const calls=sponsoredSwapCalls(q),walletId=s.request?.url?.match(/^https:\/\/api\.privy\.io\/v1\/wallets\/([a-zA-Z0-9]{10,64})\/rpc$/)?.[1],appId=s.request?.headers?.['privy-app-id']
 const sale=stockSaleReimbursement(q)
 if(!walletId||!appId||!s.feeToken||s.feeToken.length>60000||!/^\d+$/.test(s.feeUnits)||BigInt(s.feeUnits)<=0n||!/^\d+$/.test(s.totalUnits)||BigInt(s.totalUnits)<=0n||BigInt(s.totalUnits)!==(sale?BigInt(q.minimumOutUnits)-BigInt(s.feeUnits):BigInt(q.amountUnits)+BigInt(s.feeUnits))||!Number.isSafeInteger(s.expiresAt)||s.expiresAt<=Date.now()||s.expiresAt>q.expiresAt)throw Error('Swap fee changed. Review the swap again.')
 const expected=makeSponsoredBatchRequest({appId,walletId,attemptId:q.id,expiresAt:s.expiresAt,calls:[...calls,{to:sale?q.tokenOut.address:q.tokenIn.address,data:encodeFunctionData({abi:transfer,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,BigInt(s.feeUnits)]}),value:'0x0'}]})
 const canonical=(v:unknown)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
 if(canonical(s.request)!==canonical(expected))throw Error('Swap authorization changed.')
}

export function sponsoredSwapFee(q:StockSwapQuote,s:SponsoredSwapReview){
 const sale=stockSaleReimbursement(q),symbol=sale?q.tokenOut.symbol:q.tokenIn.symbol,decimals=sale?q.decimalsOut:q.decimalsIn
 return formatPocketAssetAmount(formatUnits(BigInt(s.feeUnits),decimals),symbol)+' '+symbol
}
export function sponsoredSwapOutput(q:StockSwapQuote,s?:SponsoredSwapReview,minimum=false){
 const amount=minimum?q.minimumOut:q.expectedOut
 return s&&stockSaleReimbursement(q)?formatUnits(parseUnits(amount,q.decimalsOut)-BigInt(s.feeUnits),q.decimalsOut):amount
}

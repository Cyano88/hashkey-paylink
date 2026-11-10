import {type Hex} from 'viem'
import {xLayerFeeAssets} from '../../src/pocket/lib/pocketXLayerFeeAssets.js'
import {stockClient,stockTokenAbi} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {sponsoredSwapCalls,reimbursedSwapAsset,stockSaleReimbursement} from '../../src/pocket/lib/pocketSponsoredSwap.js'
import {openStockQuote,type quoteStockSwap} from './xstocks-swap-provider.js'
import {quoteXLayerReimbursement,sealXLayerReimbursement,openXLayerReimbursement,refreshXLayerReimbursement,type XLayerFeeEstimator,type XLayerReimbursementPolicy} from './xlayer-reimbursement.js'
import {makeSponsoredBatchRequest} from '../../src/pocket/lib/pocketSponsoredRequest.js'
import type {StockSwapQuote} from '../../src/pocket/lib/pocketXStocksSwap.js'
export const swapFeeBinding=(q:StockSwapQuote,ownerId:string,walletId:string)=>({ownerId,walletId,walletAddress:q.owner,asset:reimbursedSwapAsset(q)!,amountUnits:stockSaleReimbursement(q)?q.minimumOutUnits:q.amountUnits,intentId:q.id,...(stockSaleReimbursement(q)?{feeFromOutput:true as const}:{})})
export async function quoteSponsoredSwap(q:StockSwapQuote,ownerId:string,walletId:string,appId:string,estimate:XLayerFeeEstimator,pricing:XLayerReimbursementPolicy){
 const calls=sponsoredSwapCalls(q),binding=swapFeeBinding(q,ownerId,walletId)
 if((stockSaleReimbursement(q)?q.decimalsOut:q.decimalsIn)!==xLayerFeeAssets[binding.asset].decimals)throw Error('Swap token precision changed.')
 const fee=await quoteXLayerReimbursement(binding,calls,q.expiresAt,estimate,pricing)
 if(await stockClient.getChainId()!==196)throw Error('X Layer connection unavailable.')
 const balance=await stockClient.readContract({address:q.tokenIn.address as Hex,abi:stockTokenAbi,functionName:'balanceOf',args:[q.owner]})
 if(balance<BigInt(stockSaleReimbursement(q)?q.amountUnits:fee.totalUnits))throw Object.assign(Error('Insufficient '+q.tokenIn.symbol+' including the network fee.'),{status:409,requiredFeeUnits:fee.networkFeeUnits})
 return {feeRoutingVersion:fee.feeRoutingVersion,feeToken:sealXLayerReimbursement(fee),feeUnits:fee.networkFeeUnits,totalUnits:fee.totalUnits,expiresAt:fee.expiresAt,request:makeSponsoredBatchRequest({appId,walletId,attemptId:q.id,expiresAt:fee.expiresAt,calls:fee.calls})}
}
export async function verifySponsoredSwap(input:{routeToken:string;feeToken:string;ownerId:string;walletId:string;wallet:string},estimate:XLayerFeeEstimator,reserved=false){
 const q=openStockQuote(input.routeToken,input.ownerId)
 if(q.owner.toLowerCase()!==input.wallet.toLowerCase())throw Error('Swap wallet changed.')
 const calls=sponsoredSwapCalls(q),fee=openXLayerReimbursement(input.feeToken,swapFeeBinding(q,input.ownerId,input.walletId),calls)
 if(!reserved)await refreshXLayerReimbursement(fee,calls,estimate)
 return {q,fee}
}

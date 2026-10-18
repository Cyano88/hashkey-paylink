import {type Hex} from 'viem'
import {stockClient,stockTokenAbi} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {sponsoredSwapCalls,reimbursedSwapAsset} from '../../src/pocket/lib/pocketSponsoredSwap.js'
import {openStockQuote,type quoteStockSwap} from './xstocks-swap-provider.js'
import {quoteXLayerReimbursement,sealXLayerReimbursement,openXLayerReimbursement,refreshXLayerReimbursement,type XLayerFeeEstimator,type XLayerReimbursementPolicy} from './xlayer-reimbursement.js'
import {makeSponsoredBatchRequest} from '../../src/pocket/lib/pocketSponsoredRequest.js'
import type {StockSwapQuote} from '../../src/pocket/lib/pocketXStocksSwap.js'
export const swapFeeBinding=(q:StockSwapQuote,ownerId:string,walletId:string)=>({ownerId,walletId,walletAddress:q.owner,asset:reimbursedSwapAsset(q)!,amountUnits:q.amountUnits,intentId:q.id})
export async function quoteSponsoredSwap(q:StockSwapQuote,ownerId:string,walletId:string,appId:string,estimate:XLayerFeeEstimator,pricing:XLayerReimbursementPolicy){
 const calls=sponsoredSwapCalls(q),binding=swapFeeBinding(q,ownerId,walletId)
 const fee=await quoteXLayerReimbursement(binding,calls,q.expiresAt,estimate,pricing)
 if(await stockClient.getChainId()!==196)throw Error('X Layer connection unavailable.')
 const balance=await stockClient.readContract({address:q.tokenIn.address as Hex,abi:stockTokenAbi,functionName:'balanceOf',args:[q.owner]})
 if(balance<BigInt(fee.totalUnits))throw Object.assign(Error('Insufficient '+q.tokenIn.symbol+' including the network fee.'),{status:409})
 return {feeToken:sealXLayerReimbursement(fee),feeUnits:fee.networkFeeUnits,totalUnits:fee.totalUnits,expiresAt:fee.expiresAt,request:makeSponsoredBatchRequest({appId,walletId,attemptId:q.id,expiresAt:fee.expiresAt,calls:fee.calls})}
}
export async function verifySponsoredSwap(input:{routeToken:string;feeToken:string;ownerId:string;walletId:string;wallet:string},estimate:XLayerFeeEstimator,reserved=false){
 const q=openStockQuote(input.routeToken,input.ownerId)
 if(q.owner.toLowerCase()!==input.wallet.toLowerCase())throw Error('Swap wallet changed.')
 const calls=sponsoredSwapCalls(q),fee=openXLayerReimbursement(input.feeToken,swapFeeBinding(q,input.ownerId,input.walletId),calls)
 if(!reserved)await refreshXLayerReimbursement(fee,calls,estimate)
 return {q,fee}
}

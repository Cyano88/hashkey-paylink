import {formatUnits,parseUnits} from 'viem'
import type {StockSwapQuote} from '../../src/pocket/lib/pocketXStocksSwap.js'
import type {SponsoredSwapReview} from '../../src/pocket/lib/pocketSponsoredSwap.js'
type Review={quote:StockSwapQuote;sponsorship?:SponsoredSwapReview}
/** Explicit Max only. Integer amounts and a bounded re-quote, never an idle loop. */
export async function quoteStockMaximum(available:bigint,decimals:number,initialReserve:bigint,quote:(amount:string)=>Promise<Review>):Promise<Review>{
 let reserve=initialReserve
 for(let attempt=0;attempt<3;attempt++){
  if(available<=reserve)throw Object.assign(Error('Insufficient balance including the network fee.'),{status:409})
  const amount=available-reserve
  try{
   const result=await quote(formatUnits(amount,decimals))
   if(BigInt(result.quote.amountUnits)!==amount)throw Error('Maximum amount changed.')
   const fee=result.sponsorship?BigInt(result.sponsorship.feeUnits):result.quote.tokenIn.address==='native'?(parseUnits(result.quote.gasFee,18)*120n+99n)/100n:0n
   if(amount+fee<=available)return result
   reserve=fee>reserve?fee:reserve
  }catch(error){
   const fee=(error as {requiredFeeUnits?:string}).requiredFeeUnits
   if(!fee||!/^\d+$/.test(fee)||BigInt(fee)<=reserve)throw error
   reserve=BigInt(fee)
  }
 }
 throw Object.assign(Error('Network fee changed. Try Max again.'),{status:409})
}

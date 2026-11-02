/** Shared server-side Max calculation. Quote must include every source-asset
 * debit exactly once (provider/platform fees and reimbursement). Never estimate
 * Max by treating a destination amount or a fiat valuation as a source balance. */
export async function quoteBridgeMaximum<Q>(input:{balanceUnits:bigint;quote(amountUnits:bigint):Promise<{quote:Q;amountUnits:bigint;totalUnits:bigint;expiresAt:number}>;now?:()=>number;maxAttempts?:number}){
 const now=input.now??Date.now,attempts=input.maxAttempts??8
 const fail=(message:string,code:string,status=422):never=>{throw Object.assign(Error(message),{code,status})}
 if(input.balanceUnits<=0n)fail('No balance is available to bridge.','insufficient_balance')
 if(!Number.isInteger(attempts)||attempts<1||attempts>12)throw Error('Invalid Max quote limit.')
 let low=0n,high=input.balanceUnits,candidate=high,best:Awaited<ReturnType<typeof input.quote>>|undefined
 for(let pass=0;pass<attempts&&candidate>0n&&candidate<=high;pass++){
  let result:Awaited<ReturnType<typeof input.quote>>
  try{result=await input.quote(candidate)}catch(error){
   const e=error as {code?:string;maximumAmountUnits?:unknown}
   // Only an explicit source-balance calculation may reduce Max. No-route,
   // provider-minimum, rate-limit and connectivity errors retain their meaning.
   if(e.code!=='insufficient_balance'||typeof e.maximumAmountUnits!=='string'||! /^(0|[1-9]\d*)$/.test(e.maximumAmountUnits))throw error
   const hint=BigInt(e.maximumAmountUnits)
   if(hint>=candidate)throw error
   high=candidate-1n
   if(high<=low)break
   candidate=hint>low?hint:low+(high-low+1n)/2n;continue
  }
  if(result.amountUnits!==candidate||result.totalUnits<candidate||!Number.isSafeInteger(result.expiresAt))throw Error('Invalid fee-inclusive Max quote.')
  if(result.expiresAt<=now())fail('Max quote expired. Try again.','quote_expired',409)
  if(result.totalUnits>input.balanceUnits){
   const excess=result.totalUnits-input.balanceUnits
   high=candidate-1n
   candidate=candidate>excess?candidate-excess:0n
   if(candidate<=low&&high>low)candidate=low===0n?1n:low+(high-low+1n)/2n
  }else{
   best=result;low=candidate
   const remaining=input.balanceUnits-result.totalUnits
   if(remaining===0n||low>=high)break
   candidate=low+remaining>high?high:low+remaining
  }
 }
 if(best){if(best.expiresAt<=now())fail('Max quote expired. Try again.','quote_expired',409);return {...best,balanceUnits:input.balanceUnits,unspentUnits:input.balanceUnits-best.totalUnits}}
 if(high===0n)fail('Your balance is too low to cover this route and its fees.','insufficient_balance')
 return fail('Could not verify a spendable Max amount. Refresh the quote.','max_quote_unavailable',503)
}

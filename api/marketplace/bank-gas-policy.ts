import {MarketplaceBankQuoteError} from './bank-readiness.js'
import type {MarketplaceBankQuote} from './bank-quotes.js'

/** Total estimated gas ceiling for absorbing a rise, not an extra seller fee. */
export const BANK_GAS_ABSORPTION_CAP_UNITS=10000n
export type BankGasApproval={quoteId:string;quotedNetworkFeeUnits:string;estimatedNetworkFeeUnits:string;estimatedAbsorbedUnits:string;additionalSellerDebitUnits:'0';coverageId:string;verifiedAt:number}
export function bankRequoteRequired(reason?:string){return new MarketplaceBankQuoteError({code:'MARKETPLACE_BANK_REQUOTE_REQUIRED',httpStatus:409,message:(reason?reason+' ':'')+'Withdrawal fees changed. Review and approve a fresh quote before withdrawing. Your accepted charges have not been increased.',details:{quoteRequired:true,approvalRequired:true}})}
export async function approveBankGas(q:MarketplaceBankQuote,estimated:bigint,cover:(units:string)=>Promise<{id:string}>,now=Date.now()):Promise<BankGasApproval>{
 if(q.feePolicy!=='fixed_success_only'||!/^\d{1,24}$/.test(q.networkFeeUnits??'')||estimated<0n)throw Error('Invalid accepted bank gas policy.')
 const quoted=BigInt(q.networkFeeUnits!)
 // Above the absorption cap, a previously approved higher fee can cover gas.
 // A new increase above BOTH limits always needs a new seller-approved quote.
 if(estimated>quoted&&estimated>BANK_GAS_ABSORPTION_CAP_UNITS)throw bankRequoteRequired()
 const coverage=await cover(estimated.toString())
 return {quoteId:q.quoteId,quotedNetworkFeeUnits:quoted.toString(),estimatedNetworkFeeUnits:estimated.toString(),estimatedAbsorbedUnits:(estimated>quoted?estimated-quoted:0n).toString(),additionalSellerDebitUnits:'0',coverageId:coverage.id,verifiedAt:now}
}

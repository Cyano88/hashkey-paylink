export type BankReadiness={status:'unavailable'|'quote_only'|'enabled';message:string;blockers:string[]}
export function marketplaceBankReadiness(env:NodeJS.ProcessEnv=process.env):BankReadiness{
 const blockers:string[]=[]
 if(env.MARKETPLACE_BANK_FEE_POLICY_VERIFIED!=='true')blockers.push('commission_policy_not_verified')
 if(!/^[1-9]\d{0,23}$/.test(env.MARKETPLACE_MAX_NETWORK_FEE_UNITS||'')||!/^\d+$/.test(env.MARKETPLACE_PROVIDER_SURCHARGE_BPS||'')||Number(env.MARKETPLACE_PROVIDER_SURCHARGE_BPS)>10000)blockers.push('gas_policy_not_configured')
 if(env.MARKETPLACE_BANK_PAYOUTS_ENABLED!=='true')blockers.push('bank_quotes_disabled')
 if(env.MARKETPLACE_BANK_WORKER_ENABLED!=='true')blockers.push('bank_execution_disabled')
 const status=blockers.length===0?'enabled':env.MARKETPLACE_BANK_PAYOUTS_ENABLED==='true'&&!blockers.includes('gas_policy_not_configured')?'quote_only':'unavailable'
 return {status,blockers,message:blockers.includes('commission_policy_not_verified')?'Bank withdrawals are unavailable while the 0.3% withdrawal commission and provider setup is being verified. Your available balance is retained.':blockers.length?'Bank withdrawals are not active yet. Your available balance is retained.':'Bank withdrawals require a fresh quote, enough balance for fees, and an authorized payout request.'}
}
export type BankQuoteFailure={code:'MARKETPLACE_BANK_COMMISSION_NOT_ZERO'|'MARKETPLACE_BANK_COMMISSION_MISMATCH'|'MARKETPLACE_BANK_FEE_SHORTFALL'|'MARKETPLACE_BANK_CONFIGURATION_REQUIRED';message:string;details:Record<string,string|boolean>;httpStatus:number}
export class MarketplaceBankQuoteError extends Error{
 constructor(public readonly failure:BankQuoteFailure){super(failure.message)}
}
export function bankQuoteErrorResponse(error:unknown){if(!(error instanceof MarketplaceBankQuoteError))return null;return {status:error.failure.httpStatus,body:{ok:false,error:error.message,code:error.failure.code,...error.failure.details,payoutSubmitted:false}}}

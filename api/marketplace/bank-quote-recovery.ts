import {MarketplaceBankQuoteError} from './bank-readiness.js'
import type {createMarketplaceBankCustody} from './bank-custody.js'
import type {createMarketplacePayoutCancellation} from './payout-cancellation.js'
import type {MarketplaceStore} from './repository.js'

/** Releases only proven-unsubmitted reservations through the existing guard. */
export function withBankQuoteRecovery(submit:ReturnType<typeof createMarketplaceBankCustody>['submit'],cancel:ReturnType<typeof createMarketplacePayoutCancellation>,read:()=>Promise<MarketplaceStore|undefined>){
 return async(projectId:string,paymentId:string,operationId:string,workerId:string)=>{
  try{return await submit(projectId,paymentId,operationId,workerId)}catch(error){
   if(error instanceof MarketplaceBankQuoteError&&error.failure.code==='MARKETPLACE_BANK_REQUOTE_REQUIRED'){
    const book=(await read())?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId),r=book?.bankReservations?.find(r=>r.quote.operationId===operationId)
    if(r)await cancel(projectId,paymentId,'requote:'+operationId,operationId,{credentialId:r.authorization.credentialId,businessReference:'withdrawal_fee_changed'})
   }
   throw error
  }
 }
}

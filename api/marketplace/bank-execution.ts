import {currentWithdrawalBeneficiary} from './withdrawal-plan.js'
import {checkWithdrawalSources} from './withdrawal-accounting.js'
import {applyPayoutResult} from './withdrawal-accounting.js'
import {randomUUID} from 'node:crypto'
import {marketplaceReference} from './beneficiaries.js'
import {validateMarketplaceBankQuote,type MarketplaceBankQuote} from './bank-quotes.js'
import {applyMarketplaceCommand,type MarketplaceBook} from './accounting.js'
import type {MarketplaceStore} from './repository.js'

export type BankExecution={circleTransfer?:{walletId:string;refId:string;transactionId?:string};operationId:string;attemptId:string;workerId:string;claimToken:string;claimedAt:number;leaseUntil:number;state:'claimed'|'expired'|'submitting'|'submitted'|'unknown'|'settled'|'failed';submissionStartedAt?:number;transactionHash?:string}
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;
 preflightBankExecution?:(quote:MarketplaceBankQuote)=>Promise<{quote:MarketplaceBankQuote;holdingApproved:boolean;authorizationActive:boolean}>}
function locate(store:MarketplaceStore|undefined,projectId:string,paymentId:string,operationId:string){
 for(const id of [projectId,paymentId,operationId])marketplaceReference(id)
 const book=store?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
 const operation=book?.operations.find(o=>o.id===operationId)
 const reservation=book?.bankReservations?.find(r=>r.quote.operationId===operationId)
 if(!book||!operation||!reservation)throw Error('Reserved bank payout not found.')
 return {book,operation,reservation}
}
function eligible(store:MarketplaceStore,book:MarketplaceBook,quote:MarketplaceBankQuote){
 const snapshot=quote.withdrawal?currentWithdrawalBeneficiary(store,book.plan.projectId,quote.withdrawal):book.beneficiarySnapshots?.find(b=>b.beneficiaryId===quote.beneficiaryId)
 if(quote.withdrawal&&checkWithdrawalSources(store,quote,true).some(s=>s.operation?.status!=='reserved'))throw Error('Withdrawal requires reconciliation.')
 const current=store.bankBeneficiaries?.find(b=>b.projectId===book.plan.projectId&&b.beneficiaryId===quote.beneficiaryId)
 if(snapshot?.kind!=='bank'||!current||current.status!=='active'||current.destinationDigest!==quote.destinationDigest||snapshot.destinationDigest!==quote.destinationDigest||current.sellerId!==snapshot.sellerId)throw Error('Bank payout beneficiary is no longer eligible.')
}
function latest(book:MarketplaceBook,operationId:string){return book.bankExecutions?.filter(e=>e.operationId===operationId).at(-1)}
function claimed(book:MarketplaceBook,operationId:string,token:string,now:number){
 const attempt=latest(book,operationId)
 if(!attempt||attempt.claimToken!==token||attempt.state!=='claimed'||attempt.leaseUntil<=now)throw Error('Execution claim is expired, replaced or already used.')
 return attempt
}
/** Internal coordinator only. It never signs, broadcasts, retries a submission or records settlement. */
export function createMarketplaceBankExecution(dependencies:Dependencies){
 const d=dependencies
 return {
  async claim(projectId:string,paymentId:string,operationId:string,workerId:string){
   marketplaceReference(workerId)
   const claimToken=randomUUID(),attemptId=randomUUID()
   const store=await d.mutate(s=>{
    const {book,operation,reservation}=locate(s,projectId,paymentId,operationId),now=d.now()
    if(operation.status!=='reserved')throw Error('Payout requires reconciliation; it cannot be claimed for submission.')
    validateMarketplaceBankQuote(reservation.quote,now);eligible(s,book,reservation.quote)
    const previous=latest(book,operationId)
    if(previous){
     if(previous.state!=='claimed'||previous.leaseUntil>now)throw Error('Payout execution is already claimed or may have been submitted.')
     previous.state='expired'
    }
    book.bankExecutions=[...(book.bankExecutions||[]),{operationId,attemptId,workerId,claimToken,claimedAt:now,leaseUntil:now+30_000,state:'claimed'}]
    return s
   })
   return structuredClone(latest(locate(store,projectId,paymentId,operationId).book,operationId)!)
  },
  async beginSubmission(projectId:string,paymentId:string,operationId:string,claimToken:string){
   if(!d.preflightBankExecution)throw Error('Bank execution preflight is not configured.')
   const before=locate(await d.read(),projectId,paymentId,operationId),started=d.now()
   claimed(before.book,operationId,claimToken,started)
   const expected=validateMarketplaceBankQuote(before.reservation.quote,started)
   // Adapter must refresh actual provider status, holding revision and payout authority.
   const check=await d.preflightBankExecution(structuredClone(expected))
   const refreshed=validateMarketplaceBankQuote(check.quote,d.now())
   if(check.holdingApproved!==true||check.authorizationActive!==true||JSON.stringify(refreshed)!==JSON.stringify(expected))throw Error('Bank execution preflight no longer matches the accepted payout.')
   const store=await d.mutate(s=>{
    const {book,operation,reservation}=locate(s,projectId,paymentId,operationId),now=d.now()
    const attempt=claimed(book,operationId,claimToken,now)
    if(now<started||now-started>5000)throw Error('Bank execution preflight became stale; refresh before submission.')
    if(operation.status!=='reserved')throw Error('Payout requires reconciliation before submission.')
    validateMarketplaceBankQuote(reservation.quote,now);eligible(s,book,reservation.quote)
    if(JSON.stringify(reservation.quote)!==JSON.stringify(expected))throw Error('Accepted payout changed during preflight.')
    attempt.state='submitting';attempt.submissionStartedAt=now
    // Durable ambiguity marker is committed BEFORE an external signing/submission call.
    const next=applyPayoutResult(s,book,projectId,'exec-submit:'+attempt.attemptId,operationId,'unknown','exec-attempt:'+attempt.attemptId)
    s.books[s.books.indexOf(book)]=next;return s
   })
   const {book,reservation}=locate(store,projectId,paymentId,operationId)
   return {attempt:structuredClone(latest(book,operationId)!),quote:structuredClone(reservation.quote)}
  },
  async recordSubmission(projectId:string,paymentId:string,operationId:string,claimToken:string,transactionHash:string){
   if(typeof transactionHash!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(transactionHash))throw Error('Invalid submission transaction hash.')
   const hash=transactionHash.toLowerCase()
   await d.mutate(s=>{
    const {book}=locate(s,projectId,paymentId,operationId),attempt=latest(book,operationId)
    if(!attempt||attempt.claimToken!==claimToken||!['submitting','submitted','unknown'].includes(attempt.state))throw Error('Submission attempt does not match.')
    if(attempt.transactionHash&&attempt.transactionHash!==hash)throw Error('Submission attempt already has a different transaction.')
    if(s.books.some(b=>[...(b.bankExecutions||[]),...(b.walletExecutions||[])].some(e=>e.attemptId!==attempt.attemptId&&e.transactionHash===hash)))throw Error('Submission transaction is already bound to another payout.')
    attempt.transactionHash=hash;attempt.state='submitted';return s
   })
   // A transaction hash is a submission reference, never bank settlement proof.
  },
  async markUncertain(projectId:string,paymentId:string,operationId:string,claimToken:string){
   await d.mutate(s=>{
    const {book}=locate(s,projectId,paymentId,operationId),attempt=latest(book,operationId)
    if(!attempt||attempt.claimToken!==claimToken||!['submitting','submitted','unknown'].includes(attempt.state))throw Error('Submission attempt does not match.')
    attempt.state='unknown';return s
   })
  },
  async get(projectId:string,paymentId:string,operationId:string){return structuredClone(latest(locate(await d.read(),projectId,paymentId,operationId).book,operationId)||null)},
 }
}

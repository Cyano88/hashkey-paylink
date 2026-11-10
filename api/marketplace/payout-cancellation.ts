import {applyPayoutResult} from './withdrawal-accounting.js'
import {createHash} from 'node:crypto'
import {marketplaceReference} from './beneficiaries.js'
import {applyMarketplaceCommand} from './accounting.js'
import type {MarketplaceStore} from './repository.js'
import type {BankQuoteAuthorization} from './bank-quotes.js'

export type PayoutCancellation={key:string;operationId:string;requestHash:string;authorization:BankQuoteAuthorization;cancelledAt:number}
export function createMarketplacePayoutCancellation(d:{mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number}){
 return async(projectId:string,paymentId:string,key:string,operationId:string,authorization:BankQuoteAuthorization)=>{
  for(const id of [projectId,paymentId,key,operationId,authorization.credentialId,authorization.businessReference])marketplaceReference(id)
  const actor={credentialId:authorization.credentialId,businessReference:authorization.businessReference}
  const requestHash=createHash('sha256').update(JSON.stringify([operationId,actor])).digest('hex')
  const saved=await d.mutate(s=>{
   const book=s.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
   if(!book)throw Error('Marketplace payment not found.')
   const prior=book.payoutCancellations?.find(c=>c.key===key)
   if(prior){if(prior.requestHash!==requestHash)throw Error('Idempotency key was used for a different cancellation.');return s}
   if(book.journal.some(j=>j.key===key))throw Error('Idempotency key was used for a different request.')
   const operation=book.operations.find(o=>o.id===operationId)
   if(!operation||operation.kind!=='payout'||operation.status!=='reserved'||!book.walletReservations?.some(r=>r.operationId===operationId)&&!book.bankReservations?.some(r=>r.quote.operationId===operationId))throw Error('Unsubmitted payout reservation not found.')
   const attempts=[...(book.bankExecutions||[]),...(book.walletExecutions||[])].filter(e=>e.operationId===operationId)
   if(attempts.some(e=>e.submissionStartedAt!==undefined||e.transactionHash||!['claimed','expired'].includes(e.state)))throw Error('Payout may have been submitted; reconciliation is required.')
   const next=applyPayoutResult(s,book,projectId,key,operationId,'failed','cancel:'+createHash('sha256').update(JSON.stringify([projectId,paymentId,operationId,key])).digest('hex'))
   for(const attempt of [...(next.bankExecutions||[]),...(next.walletExecutions||[])].filter(e=>e.operationId===operationId)){attempt.state='expired';attempt.leaseUntil=d.now()}
   next.payoutCancellations=[...(next.payoutCancellations||[]),{key,operationId,requestHash,authorization:actor,cancelledAt:d.now()}]
   s.books[s.books.indexOf(book)]=next;return s
  })
  return structuredClone(saved.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)!.operations.find(o=>o.id===operationId)!)
 }
}

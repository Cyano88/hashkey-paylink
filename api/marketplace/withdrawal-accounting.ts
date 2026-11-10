import {createHash} from 'node:crypto'
const referenceHash=(...parts:string[])=>'withdrawal:'+createHash('sha256').update(JSON.stringify(parts)).digest('hex')
import {applyMarketplaceCommand,type MarketplaceBook} from './accounting.js'
import {validateWithdrawalPlan,currentWithdrawalBeneficiary,withdrawalSourceOperation,type WithdrawalPlan} from './withdrawal-plan.js'
import type {MarketplaceStore} from './repository.js'
type Quote={projectId:string;paymentId:string;allocationId:string;operationId:string;beneficiaryId:string;debitUnits:string;networkFeeUnits?:string;withdrawal?:WithdrawalPlan}
export function checkWithdrawalSources(store:MarketplaceStore,q:Quote,reserved=false){
 if(!q.withdrawal)throw Error('Withdrawal source plan is required.')
 const p=validateWithdrawalPlan(q.withdrawal,q.projectId,q.paymentId,q.allocationId,q.beneficiaryId,q.debitUnits)
 let cumulative=0n,previousFee=0n;const fee=BigInt(q.networkFeeUnits??'0'),total=BigInt(q.debitUnits)
 if(fee<0n||fee>=total)throw Error('Invalid withdrawal fee.')
 return p.sources.map((source,index)=>{
  const book=store.books.find(b=>b.plan.projectId===q.projectId&&b.plan.paymentId===source.paymentId),allocation=book?.plan.allocations.find(a=>a.id===source.allocationId)
  if(!book||!book.fundingEvidence||book.plan.asset!=='USDC'||book.plan.network!=='base'||book.collectionStatus&&book.collectionStatus!=='finalized'||allocation?.sellerId!==p.sellerId||allocation?.role!==p.role)throw Error('Withdrawal source ownership or funding changed.')
  const operationId=withdrawalSourceOperation(q.operationId,index),operation=book.operations.find(o=>o.id===operationId)
  cumulative+=BigInt(source.units);const cumulativeFee=fee*cumulative/total,feeUnits=(cumulativeFee-previousFee).toString();previousFee=cumulativeFee
  if(reserved){if(!operation||operation.kind!=='payout'||operation.allocationId!==source.allocationId||operation.units!==source.units||operation.withdrawal?.parentPaymentId!==q.paymentId||operation.withdrawal?.parentOperationId!==q.operationId||operation.withdrawal?.feeUnits!==feeUnits)throw Error('Withdrawal source reservation changed.')}
  else if(operation||BigInt(book.balances.find(b=>b.allocationId===source.allocationId)?.available??'0')<BigInt(source.units))throw Error('Insufficient released funds or duplicate withdrawal operation.')
  return {book,source,operationId,feeUnits,operation}
 })
}
export function reserveWithdrawalSources(store:MarketplaceStore,q:Quote,key:string){
 if(store.books.filter(b=>b.plan.projectId===q.projectId).some(b=>b.walletReservations?.some(r=>r.key===key||r.operationId===q.operationId)||b.bankReservations?.some(r=>r.key===key||r.quote.operationId===q.operationId)))throw Error('Idempotency key or withdrawal operation already exists.')
 currentWithdrawalBeneficiary(store,q.projectId,q.withdrawal!)
 const sources=checkWithdrawalSources(store,q),staged=structuredClone(store)
 for(const {source,operationId,feeUnits} of sources){const index=staged.books.findIndex(b=>b.plan.projectId===q.projectId&&b.plan.paymentId===source.paymentId);staged.books[index]=applyMarketplaceCommand(staged.books[index],q.projectId,referenceHash(key,operationId),{type:'reserve',operationId,allocationId:source.allocationId,kind:'payout',amountUnits:source.units,withdrawal:{parentPaymentId:q.paymentId,parentOperationId:q.operationId,feeUnits}})}
 store.books=staged.books
 return store.books.find(b=>b.plan.projectId===q.projectId&&b.plan.paymentId===q.paymentId)!
}
export function payoutQuote(book:MarketplaceBook,operationId:string){return book.walletReservations?.find(r=>r.operationId===operationId)?.quote??book.bankReservations?.find(r=>r.quote.operationId===operationId)?.quote}
/** Called only after trusted outcome verification, or pre-submission cancellation. */
export function applyPayoutResult(store:MarketplaceStore,book:MarketplaceBook,projectId:string,key:string,operationId:string,status:'unknown'|'settled'|'failed',evidenceId:string){
 const q=payoutQuote(book,operationId)
 if(!q?.withdrawal)return applyMarketplaceCommand(book,projectId,key,{type:'result',operationId,status,evidenceId})
 const sources=checkWithdrawalSources(store,q,true),staged=structuredClone(store)
 if(sources.some(s=>s.operation!.status!==sources[0].operation!.status))throw Error('Withdrawal sources have conflicting states.')
 for(const {source,operationId:sourceOperation} of sources){const index=staged.books.findIndex(b=>b.plan.projectId===projectId&&b.plan.paymentId===source.paymentId);staged.books[index]=applyMarketplaceCommand(staged.books[index],projectId,referenceHash(key,sourceOperation),{type:'result',operationId:sourceOperation,status,evidenceId:sourceOperation===operationId?evidenceId:referenceHash(evidenceId,sourceOperation)})}
 const anchor=staged.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===q.paymentId)!
 // Retain one canonical evidence reference on the anchor for global replay checks.
 anchor.operations.find(o=>o.id===operationId)!.evidenceId=evidenceId
 for(let i=0;i<store.books.length;i++)if(store.books[i].plan.projectId!==projectId||store.books[i].plan.paymentId!==q.paymentId)store.books[i]=staged.books[i]
 return anchor
}

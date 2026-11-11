import {formatUnits,parseUnits} from 'viem'
import {checkoutReceipt,type ReceiptCheckout} from './checkout-receipts.js'
import {marketplaceSettlementReceipts} from './marketplace/settlement-receipts.js'
import type {MarketplaceStore} from './marketplace/repository.js'
export type BusinessReportInput={projectId:string;name:string;audience:'operator'|'seller';sellerId?:string;from:number;to:number;generatedAt:number;timeZone:string;frequency:'daily'|'weekly';marketplace?:MarketplaceStore;checkouts:Array<{record:ReceiptCheckout;recordedAt:number}>}
export type BusinessReport=Omit<BusinessReportInput,'marketplace'|'checkouts'>&{activityCount:number;pendingOperations:number;metrics:Array<{section:'period'|'current';label:string;amount:string;asset:string;network:string}>}
/** Report only canonical verified outcomes. Current balances are explicitly a
 * generation-time snapshot, not an invented historical balance at period end. */
export function businessReceiptReport(input:BusinessReportInput):BusinessReport{
 if(input.audience==='seller'&&!input.sellerId)throw Error('Seller summary requires a seller scope.')
 if(!Number.isFinite(input.from)||!Number.isFinite(input.to)||!Number.isFinite(input.generatedAt)||input.from>=input.to||input.generatedAt<input.to)throw Error('Invalid summary period.')
 const buckets=new Map<string,{section:'period'|'current';label:string;units:bigint;asset:string;network:string}>(),events=new Set<string>(),pending=new Set<string>()
 const add=(label:string,value:string,asset='USDC',network='base',section:'period'|'current'='period')=>{
  if(!/^(0|[1-9]\d{0,35})(?:\.\d{1,18})?$/.test(value))throw Error('Invalid summary amount.')
  const key=JSON.stringify([section,label,asset,network]),row=buckets.get(key)||{section,label,asset,network,units:0n};row.units+=parseUnits(value,18);buckets.set(key,row)
 }
 const inPeriod=(time:number)=>Number.isFinite(time)&&time>=input.from&&time<input.to
 const books=input.marketplace?.books.filter(b=>b.plan.projectId===input.projectId)??[]
 const bound=new Set(books.map(b=>b.collectionCheckout?.checkoutId).filter(Boolean))
 if(input.audience==='operator')for(const {record,recordedAt} of input.checkouts){
  if(record.partnerId!==input.projectId||bound.has(record.id)||!inPeriod(recordedAt)||events.has('checkout:'+record.id)||'providerFunding' in record&&record.providerFunding)continue
  if('feePayer' in record&&record.feePayer==='payer')throw Error('Marketplace checkout requires its canonical allocation book.')
  const receipt=checkoutReceipt(record);if(!receipt||receipt.status!=='confirmed')continue
  events.add('checkout:'+record.id)
  add('Checkout sales',receipt.amount,receipt.asset,receipt.chain)
  const fees=receipt.merchantFees
  if(fees){add('Merchant-paid processing fees',fees.platformFee,receipt.asset,receipt.chain);add('Merchant-paid network fees',fees.networkFee,receipt.asset,receipt.chain)}
  if(receipt.fiatCurrency){
   if(!receipt.merchantSettlementAmount)throw Error('Local settlement amount is unavailable for the summary.')
   add('Local settlement received',receipt.merchantSettlementAmount,receipt.fiatCurrency,receipt.chain)
  }else add('Net checkout sales',fees?.netAmount||receipt.amount,receipt.asset,receipt.chain)
 }
 for(const book of books){
  const final=!!book.fundingEvidence&&book.collectionProof?.evidenceId===book.fundingEvidence
  const observed=book.collectionStatus==='pending_finality'&&!!book.collectionObservation
  if(!final&&!observed)continue
  const allocations=book.plan.allocations.filter(a=>input.audience==='operator'||a.role==='seller'&&a.sellerId===input.sellerId)
  if(!allocations.length)continue
  if(final&&inPeriod(book.collectionProof!.verifiedAt)){
   events.add('collection:'+book.plan.paymentId)
   if(input.audience==='operator')add('Marketplace payments collected',formatUnits(BigInt(book.plan.amountUnits),6))
   for(const a of allocations)add(input.audience==='seller'?'Sales allocated':a.role==='platform'?'Platform earnings allocated':'Seller earnings allocated',formatUnits(BigInt(a.amountUnits),6))
  }
  for(const a of allocations){
   const balance=book.balances.find(b=>b.allocationId===a.id);if(!balance)continue
   const prefix=input.audience==='operator'?(a.role==='platform'?'Platform ':'Seller '):''
   for(const [key,label] of [['pending',observed?'awaiting finality':'pending release'],['available','available balance'],['reserved','reserved balance']] as const)add(prefix+label,formatUnits(BigInt(balance[key]),6),'USDC','base','current')
  }
  const ids=new Set(allocations.map(a=>a.id))
  for(const operation of book.operations.filter(o=>ids.has(o.allocationId)&&['reserved','unknown'].includes(o.status)))pending.add(operation.withdrawal?operation.withdrawal.parentPaymentId+':'+operation.withdrawal.parentOperationId:book.plan.paymentId+':'+operation.id)
 }
 for(const r of marketplaceSettlementReceipts(input.marketplace).filter(r=>r.projectId===input.projectId&&inPeriod(r.settledAt))){
  const book=books.find(b=>b.plan.paymentId===r.paymentId);if(!book)continue
  if(r.kind==='refund'){
   if(input.audience==='operator'){add('Buyer refunds completed',r.amount);add('Marketplace-funded refund network fees',r.networkFee);events.add(r.id)}
   else{
    const execution=book.refundExecutions?.find(e=>e.state==='settled'&&e.transactionHash===r.transactionHash),reservation=book.refundReservations?.find(x=>x.refundId===execution?.refundId)
    const own=new Set(book.plan.allocations.filter(a=>a.role==='seller'&&a.sellerId===input.sellerId).map(a=>a.id))
    const units=reservation?.allocations.filter(a=>own.has(a.allocationId)).reduce((n,a)=>n+BigInt(a.amountUnits),0n)??0n
    if(units){add('Refunds from your allocations',formatUnits(units,6));events.add(r.id)}
   }
   continue
  }
  if(input.audience==='seller'&&(r.sellerId!==input.sellerId||r.allocationRole!=='seller'))continue
  events.add(r.id)
  const prefix=input.audience==='operator'?(r.allocationRole==='platform'?'Platform ':r.allocationRole==='seller'?'Seller ':'Unclassified '):''
  add(prefix+(r.settlement==='bank'?'bank withdrawals received':'wallet withdrawals received'),r.amount,r.currency||'USDC')
  add(prefix+'balance debited for withdrawals',r.debitAmount)
  if(r.settlement==='bank'){add(prefix+'withdrawal commission',r.commission||'0');add(prefix+'withdrawal provider fees',r.providerFee||'0')}
  add(prefix+'withdrawal network fees',r.networkFee)
 }
 const {marketplace:_,checkouts:__,...context}=input
 return {...context,activityCount:events.size,pendingOperations:pending.size,metrics:[...buckets.values()].map(({units,...r})=>({...r,amount:formatUnits(units,18)}))}
}

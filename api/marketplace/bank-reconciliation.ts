import {createHash,randomUUID} from 'node:crypto'
import {marketplaceReference} from './beneficiaries.js'
import {applyMarketplaceCommand} from './accounting.js'
import type {MarketplaceStore} from './repository.js'
import type {MarketplaceBankQuote} from './bank-quotes.js'
import type {BankExecution} from './bank-execution.js'

/** Trusted verifier output only. Neither webhook bodies nor developer-supplied statuses satisfy this boundary. */
export type BankOutcomeEvidence={
 evidenceId:string;projectId:string;paymentId:string;operationId:string;attemptId:string;providerOrderId:string;holdingId:string;holdingRevision:string;destinationDigest:string;
 network:'base';asset:'USDC';currency:'NGN';basis:'bank_settled'|'funding_reverted'|'fully_returned';providerFinal:true;
 fundingTransactionHash:string;fundingEvidenceId:string;providerEvidenceId:string;returnEvidenceId?:string;
 fundingUnits:string;ngnPaidMinor:string;returnedUnits:string;finalizedAt:number
}
export type BankReconciliation={evidence:BankOutcomeEvidence;hash:string;status:'settled'|'failed';eventId:string}
export type MarketplaceBankEvent={id:string;type:'marketplace.payout.settled'|'marketplace.payout.failed';projectId:string;paymentId:string;operationId:string;asset:'USDC';currency:'NGN';debitUnits:string;ngnPaidMinor:string;createdAt:number;delivery:'pending'}
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;verifyBankOutcome?:(input:{quote:MarketplaceBankQuote;attempt:BankExecution})=>Promise<BankOutcomeEvidence|null>}
function locate(store:MarketplaceStore|undefined,projectId:string,paymentId:string,operationId:string){
 for(const id of [projectId,paymentId,operationId])marketplaceReference(id)
 const book=store?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
 const operation=book?.operations.find(o=>o.id===operationId),reservation=book?.bankReservations?.find(r=>r.quote.operationId===operationId)
 const attempt=book?.bankExecutions?.filter(e=>e.operationId===operationId).at(-1)
 if(!book||!operation||!reservation||!attempt||!['submitting','submitted','unknown','settled','failed'].includes(attempt.state))throw Error('Submitted bank payout not found.')
 return {book,operation,quote:reservation.quote,attempt}
}
function units(value:string){if(typeof value!=='string'||!/^(0|[1-9]\d{0,23})$/.test(value))throw Error('Invalid reconciliation amount.');return BigInt(value)}
function validate(input:BankOutcomeEvidence,quote:MarketplaceBankQuote,attempt:BankExecution,now:number):BankOutcomeEvidence{
 for(const key of ['evidenceId','projectId','paymentId','operationId','attemptId','providerOrderId','holdingId','holdingRevision','fundingEvidenceId','providerEvidenceId'] as const)marketplaceReference(input[key])
 if(input.projectId!==quote.projectId||input.paymentId!==quote.paymentId||input.operationId!==quote.operationId||input.attemptId!==attempt.attemptId||input.providerOrderId!==quote.providerOrderId||input.holdingId!==quote.holdingId||input.holdingRevision!==quote.holdingRevision||input.destinationDigest!==quote.destinationDigest||input.network!=='base'||input.asset!=='USDC'||input.currency!=='NGN'||input.providerFinal!==true)throw Error('Bank outcome evidence does not match the reserved payout.')
 if(typeof input.fundingTransactionHash!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(input.fundingTransactionHash))throw Error('Invalid reconciliation funding transaction.')
 const transactionHash=input.fundingTransactionHash.toLowerCase()
 if(attempt.transactionHash&&attempt.transactionHash!==transactionHash)throw Error('Bank outcome funding transaction changed.')
 if(!Number.isSafeInteger(input.finalizedAt)||input.finalizedAt>now||input.finalizedAt<(attempt.submissionStartedAt??Infinity))throw Error('Invalid bank outcome finalization time.')
 if(units(input.fundingUnits)!==BigInt(quote.fundingUnits))throw Error('Bank outcome funding amount changed.')
 const paid=units(input.ngnPaidMinor),returned=units(input.returnedUnits)
 if(input.basis==='bank_settled'){
  if(paid!==BigInt(quote.ngnMinor)||returned!==0n||input.returnEvidenceId!==undefined)throw Error('Bank settlement must prove the exact NGN payment without a return.')
 }else if(input.basis==='funding_reverted'){
  if(paid!==0n||returned!==0n||input.returnEvidenceId!==undefined)throw Error('Reverted funding cannot include bank payment or returned funds.')
 }else if(input.basis==='fully_returned'){
  marketplaceReference(input.returnEvidenceId)
  if(paid!==0n||returned!==BigInt(quote.debitUnits))throw Error('Only a full verified return can restore the entire reservation.')
 }else throw Error('Bank outcome requires definitive settlement or failure evidence.')
 const ids=[input.evidenceId,input.fundingEvidenceId,input.providerEvidenceId,...(input.returnEvidenceId?[input.returnEvidenceId]:[])]
 if(new Set(ids).size!==ids.length)throw Error('Use distinct canonical evidence references.')
 return {evidenceId:input.evidenceId,projectId:input.projectId,paymentId:input.paymentId,operationId:input.operationId,attemptId:input.attemptId,providerOrderId:input.providerOrderId,holdingId:input.holdingId,holdingRevision:input.holdingRevision,destinationDigest:input.destinationDigest,network:'base',asset:'USDC',currency:'NGN',basis:input.basis,providerFinal:true,fundingTransactionHash:transactionHash,fundingEvidenceId:input.fundingEvidenceId,providerEvidenceId:input.providerEvidenceId,...(input.returnEvidenceId?{returnEvidenceId:input.returnEvidenceId}:{}),fundingUnits:input.fundingUnits,ngnPaidMinor:input.ngnPaidMinor,returnedUnits:input.returnedUnits,finalizedAt:input.finalizedAt}
}
const proofs=(e:BankOutcomeEvidence)=>[e.evidenceId,e.fundingEvidenceId,e.providerEvidenceId,...(e.returnEvidenceId?[e.returnEvidenceId]:[])]
export function createMarketplaceBankReconciliation(dependencies:Dependencies){
 const d=dependencies
 return {
  async reconcile(projectId:string,paymentId:string,operationId:string){
   if(!d.verifyBankOutcome)throw Error('Bank outcome verification is not configured.')
   const before=locate(await d.read(),projectId,paymentId,operationId)
   const resolved=await d.verifyBankOutcome({quote:structuredClone(before.quote),attempt:structuredClone(before.attempt)})
   if(!resolved){const current=locate(await d.read(),projectId,paymentId,operationId);return {operationId,status:current.operation.status,changed:false}}
   const evidence=validate(structuredClone(resolved),before.quote,before.attempt,d.now()),hash=createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
   const status=evidence.basis==='bank_settled'?'settled' as const:'failed' as const
   let changed=false
   const store=await d.mutate(s=>{
    const {book,operation,quote,attempt}=locate(s,projectId,paymentId,operationId)
    validate(evidence,quote,attempt,d.now())
    const existing=book.bankReconciliations?.find(r=>r.evidence.evidenceId===evidence.evidenceId)
    if(existing){if(existing.hash!==hash)throw Error('Reconciliation evidence was changed.');return s}
    if(operation.status==='settled'||operation.status==='failed')throw Error('Payout is already final; conflicting evidence requires review.')
    const references=proofs(evidence)
    if(s.books.some(b=>b.bankReconciliations?.some(r=>proofs(r.evidence).some(id=>references.includes(id)))))throw Error('Reconciliation evidence was already used.')
    if(s.books.some(b=>references.includes(b.fundingEvidence||'')||b.operations.some(o=>references.includes(o.evidenceId||''))))throw Error('Reconciliation proof was already consumed by accounting.')
    if(s.books.some(b=>b.bankExecutions?.some(e=>e.attemptId!==attempt.attemptId&&e.transactionHash===evidence.fundingTransactionHash)))throw Error('Funding transaction is already bound to another payout.')
    const eventId=randomUUID()
    const next=applyMarketplaceCommand(book,projectId,'bank-result:'+eventId,{type:'result',operationId,status,evidenceId:evidence.evidenceId})
    const nextAttempt=next.bankExecutions!.find(e=>e.attemptId===attempt.attemptId)!
    nextAttempt.transactionHash=evidence.fundingTransactionHash;nextAttempt.state=status
    next.bankReconciliations=[...(next.bankReconciliations||[]),{evidence,hash,status,eventId}]
    next.bankEvents=[...(next.bankEvents||[]),{id:eventId,type:status==='settled'?'marketplace.payout.settled':'marketplace.payout.failed',projectId,paymentId,operationId,asset:'USDC',currency:'NGN',debitUnits:quote.debitUnits,ngnPaidMinor:evidence.ngnPaidMinor,createdAt:d.now(),delivery:'pending'}]
    s.books[s.books.indexOf(book)]=next;changed=true;return s
   })
   return {operationId,status:locate(store,projectId,paymentId,operationId).operation.status,changed}
  },
 }
}

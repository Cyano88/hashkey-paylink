import {createHash,randomUUID} from 'node:crypto'
import {getAddress} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceReference} from './beneficiaries.js'
import {applyMarketplaceCommand} from './accounting.js'
import type {MarketplaceStore} from './repository.js'
import type {WalletPayoutReservation} from './wallet-payouts.js'
import type {WalletExecution} from './wallet-execution.js'
import type {MarketplaceDeliveryState} from './webhooks.js'

/** Normalized output of a trusted canonical-receipt verifier, not a request/webhook body. */
export type WalletOutcomeEvidence={projectId:string;paymentId:string;operationId:string;attemptId:string;holdingId:string;holdingRevision:string;transferHash:string;chainId:8453;asset:'USDC'|'USDT';tokenAddress:string;sender:string;recipient:string;requestedUnits:string;transferredUnits:string;transactionHash:string;blockHash:string;blockNumber:string;logIndex:number|null;outcome:'transferred'|'reverted';finality:'finalized';finalizedAt:number}
export type WalletReconciliation={evidence:WalletOutcomeEvidence & {evidenceId:string};hash:string;status:'settled'|'failed';eventId:string}
export type MarketplaceWalletEvent={id:string;type:'marketplace.payout.settled'|'marketplace.payout.failed';projectId:string;paymentId:string;operationId:string;asset:'USDC'|'USDT';currency:'USDC'|'USDT';network:'base';debitUnits:string;recipientAmountUnits:string;createdAt:number;delivery:'pending'|'delivering'|'delivered'|'dead'} & MarketplaceDeliveryState
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;verifyWalletOutcome?:(input:{projectId:string;paymentId:string;reservation:WalletPayoutReservation;attempt:WalletExecution})=>Promise<WalletOutcomeEvidence|null>}
function locate(store:MarketplaceStore|undefined,projectId:string,paymentId:string,operationId:string){
 for(const id of [projectId,paymentId,operationId])marketplaceReference(id)
 const book=store?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId),operation=book?.operations.find(o=>o.id===operationId),reservation=book?.walletReservations?.find(r=>r.operationId===operationId),attempt=book?.walletExecutions?.filter(e=>e.operationId===operationId).at(-1)
 if(!book||!operation||!reservation||!attempt?.executionAuthorization||!['submitting','submitted','unknown','settled','failed'].includes(attempt.state))throw Error('Submitted wallet payout not found.')
 return {book,operation,reservation,attempt}
}
function hash32(value:string){if(typeof value!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(value))throw Error('Invalid wallet outcome hash.');return value.toLowerCase()}
function units(value:string){if(typeof value!=='string'||!/^(0|[1-9]\d{0,23})$/.test(value))throw Error('Invalid wallet outcome units.');return BigInt(value)}
function validate(input:WalletOutcomeEvidence,current:ReturnType<typeof locate>,now:number):WalletReconciliation['evidence']{
 const {book,reservation:r,attempt:a}=current,approved=a.executionAuthorization!
 if(input.projectId!==book.plan.projectId||input.paymentId!==book.plan.paymentId||input.operationId!==r.operationId||input.attemptId!==a.attemptId||input.holdingId!==approved.holdingId||input.holdingRevision!==approved.holdingRevision||input.transferHash!==approved.transferHash||input.chainId!==8453||input.asset!==r.asset||input.finality!=='finalized')throw Error('Wallet outcome does not match the approved payout or finality policy.')
 const tokenAddress=getAddress(input.tokenAddress),sender=getAddress(input.sender),recipient=getAddress(input.recipient),transactionHash=hash32(input.transactionHash),blockHash=hash32(input.blockHash)
 if(tokenAddress!==getAddress(BASE_STABLECOINS[r.asset].address)||tokenAddress!==getAddress(r.tokenAddress)||sender!==getAddress(approved.sender)||recipient!==getAddress(r.recipient))throw Error('Wallet outcome transfer destination or asset changed.')
 if(a.transactionHash&&a.transactionHash!==transactionHash)throw Error('Wallet outcome transaction changed.')
 if(typeof input.blockNumber!=='string'||!/^[1-9]\d{0,19}$/.test(input.blockNumber)||!Number.isSafeInteger(input.finalizedAt)||input.finalizedAt>now||input.finalizedAt<(a.submissionStartedAt??Infinity))throw Error('Invalid wallet outcome block or finalization time.')
 if(units(input.requestedUnits)!==BigInt(r.amountUnits))throw Error('Wallet outcome requested amount changed.')
 const transferred=units(input.transferredUnits)
 if(input.outcome==='transferred'){
  if(transferred!==BigInt(r.amountUnits)||!Number.isSafeInteger(input.logIndex)||(input.logIndex??-1)<0)throw Error('Wallet settlement requires the exact finalized transfer log.')
 }else if(input.outcome==='reverted'){
  if(transferred!==0n||input.logIndex!==null)throw Error('Reverted payout cannot include a transferred amount or log.')
 }else throw Error('Wallet outcome is not definitive.')
 const evidenceId=`base:8453:${transactionHash}:${input.outcome==='reverted'?'reverted':input.logIndex}`
 return {projectId:input.projectId,paymentId:input.paymentId,operationId:input.operationId,attemptId:input.attemptId,holdingId:input.holdingId,holdingRevision:input.holdingRevision,transferHash:input.transferHash,chainId:8453,asset:input.asset,tokenAddress,sender,recipient,requestedUnits:input.requestedUnits,transferredUnits:input.transferredUnits,transactionHash,blockHash,blockNumber:input.blockNumber,logIndex:input.logIndex,outcome:input.outcome,finality:'finalized',finalizedAt:input.finalizedAt,evidenceId}
}
export function createMarketplaceWalletReconciliation(dependencies:Dependencies){
 const d=dependencies
 return {
  async reconcile(projectId:string,paymentId:string,operationId:string){
   if(!d.verifyWalletOutcome)throw Error('Wallet outcome verification is not configured.')
   const before=locate(await d.read(),projectId,paymentId,operationId)
   const result=await d.verifyWalletOutcome({projectId,paymentId,reservation:structuredClone(before.reservation),attempt:structuredClone(before.attempt)})
   if(!result)return {operationId,status:locate(await d.read(),projectId,paymentId,operationId).operation.status,changed:false}
   const evidence=validate(structuredClone(result),before,d.now()),hash=createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),status=evidence.outcome==='transferred'?'settled' as const:'failed' as const
   let changed=false
   const store=await d.mutate(s=>{
    const current=locate(s,projectId,paymentId,operationId),{book,operation,attempt}=current
    validate(evidence,current,d.now())
    const previous=book.walletReconciliations?.find(r=>r.evidence.evidenceId===evidence.evidenceId)
    if(previous){if(previous.hash!==hash)throw Error('Wallet reconciliation evidence was changed.');return s}
    if(operation.status==='settled'||operation.status==='failed')throw Error('Wallet payout is already final; conflicting evidence requires review.')
    if(s.books.some(b=>b.fundingEvidence===evidence.evidenceId||b.operations.some(o=>o.evidenceId===evidence.evidenceId)))throw Error('Wallet outcome evidence was already consumed.')
    if(s.books.some(b=>b.refundExecutions?.some(e=>e.transactionHash===evidence.transactionHash)))throw Error('Transaction already used by a marketplace refund.')
    if(s.books.some(b=>[...(b.bankExecutions||[]),...(b.walletExecutions||[])].some(e=>e.attemptId!==attempt.attemptId&&e.transactionHash===evidence.transactionHash)))throw Error('Wallet outcome transaction is already bound to another payout.')
    const eventId=randomUUID(),next=applyMarketplaceCommand(book,projectId,'wallet-result:'+eventId,{type:'result',operationId,status,evidenceId:evidence.evidenceId})
    const nextAttempt=next.walletExecutions!.find(e=>e.attemptId===attempt.attemptId)!
    nextAttempt.state=status;nextAttempt.transactionHash=evidence.transactionHash
    next.walletReconciliations=[...(next.walletReconciliations||[]),{evidence,hash,status,eventId}]
    next.walletEvents=[...(next.walletEvents||[]),{id:eventId,type:status==='settled'?'marketplace.payout.settled':'marketplace.payout.failed',projectId,paymentId,operationId,asset:evidence.asset,currency:evidence.asset,network:'base',debitUnits:evidence.requestedUnits,recipientAmountUnits:evidence.transferredUnits,createdAt:d.now(),delivery:'pending'}]
    s.books[s.books.indexOf(book)]=next;changed=true;return s
   })
   return {operationId,status:locate(store,projectId,paymentId,operationId).operation.status,changed}
  },
 }
}

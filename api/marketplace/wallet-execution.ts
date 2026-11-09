import {createHash,randomUUID} from 'node:crypto'
import {getAddress} from 'viem'
import {marketplaceReference} from './beneficiaries.js'
import {prepareMarketplaceWalletTransfer} from './wallet-payouts.js'
import {applyMarketplaceCommand} from './accounting.js'
import type {MarketplaceStore} from './repository.js'
import type {BankExecution} from './bank-execution.js'

export type WalletExecutionAuthorization={holdingId:string;holdingRevision:string;sender:string;feePolicyId:string;transferHash:string;expiresAt:number;holdingApproved:true;authorizationActive:true;feesCoveredOutsideAllocation:true;additionalTokenDebitUnits:'0'}
export type WalletExecution=BankExecution & {executionAuthorization?:WalletExecutionAuthorization;submitBefore?:number}
type Transfer=ReturnType<typeof prepareMarketplaceWalletTransfer>
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;preflightWalletExecution?:(transfer:Transfer)=>Promise<WalletExecutionAuthorization>}
export function walletTransferHash(transfer:Transfer){return createHash('sha256').update(JSON.stringify(transfer)).digest('hex')}
function locate(store:MarketplaceStore|undefined,projectId:string,paymentId:string,operationId:string){
 for(const id of [projectId,paymentId,operationId])marketplaceReference(id)
 const book=store?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
 const operation=book?.operations.find(o=>o.id===operationId)
 if(!book||!operation||!book.walletReservations?.some(r=>r.operationId===operationId))throw Error('Reserved wallet payout not found.')
 return {book,operation}
}
const latest=(book:ReturnType<typeof locate>['book'],id:string)=>book.walletExecutions?.filter(e=>e.operationId===id).at(-1)
function claimed(book:ReturnType<typeof locate>['book'],id:string,token:string,now:number){
 const attempt=latest(book,id)
 if(!attempt||attempt.claimToken!==token||attempt.state!=='claimed'||attempt.leaseUntil<=now)throw Error('Wallet execution claim is expired, replaced or already used.')
 return attempt
}
function authorization(input:WalletExecutionAuthorization,transfer:Transfer,now:number):WalletExecutionAuthorization{
 for(const key of ['holdingId','holdingRevision','feePolicyId'] as const)marketplaceReference(input[key])
 const sender=getAddress(input.sender)
 if(sender==='0x0000000000000000000000000000000000000000'||sender===getAddress(transfer.recipient)||input.holdingApproved!==true||input.authorizationActive!==true||input.feesCoveredOutsideAllocation!==true||input.additionalTokenDebitUnits!=='0'||input.transferHash!==walletTransferHash(transfer))throw Error('Wallet execution authorization does not match the reserved transfer.')
 if(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=now+5000)throw Error('Wallet execution authorization is expired or too short.')
 return {holdingId:input.holdingId,holdingRevision:input.holdingRevision,sender,feePolicyId:input.feePolicyId,transferHash:input.transferHash,expiresAt:input.expiresAt,holdingApproved:true,authorizationActive:true,feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0'}
}
/** Coordination only. The custody adapter must wrap/execute the token call; no signing happens here. */
export function createMarketplaceWalletExecution(dependencies:Dependencies){
 const d=dependencies
 return {
  async claim(projectId:string,paymentId:string,operationId:string,workerId:string){
   marketplaceReference(workerId)
   const token=randomUUID(),attemptId=randomUUID()
   const store=await d.mutate(s=>{
    const {book}=locate(s,projectId,paymentId,operationId),now=d.now()
    prepareMarketplaceWalletTransfer(s,projectId,paymentId,operationId)
    const prior=latest(book,operationId)
    if(prior){if(prior.state!=='claimed'||prior.leaseUntil>now)throw Error('Wallet payout is claimed or may have been submitted.');prior.state='expired'}
    book.walletExecutions=[...(book.walletExecutions||[]),{operationId,attemptId,claimToken:token,workerId,claimedAt:now,leaseUntil:now+30000,state:'claimed'}];return s
   })
   return structuredClone(latest(locate(store,projectId,paymentId,operationId).book,operationId)!)
  },
  async beginSubmission(projectId:string,paymentId:string,operationId:string,token:string){
   if(!d.preflightWalletExecution)throw Error('Wallet execution preflight is not configured.')
   const stored=await d.read(),before=locate(stored,projectId,paymentId,operationId),started=d.now()
   claimed(before.book,operationId,token,started)
   const transfer=prepareMarketplaceWalletTransfer(stored,projectId,paymentId,operationId)
   const approved=authorization(await d.preflightWalletExecution(structuredClone(transfer)),transfer,d.now())
   const store=await d.mutate(s=>{
    const {book}=locate(s,projectId,paymentId,operationId),now=d.now(),attempt=claimed(book,operationId,token,now)
    if(now<started||now-started>5000)throw Error('Wallet execution preflight became stale.')
    const current=prepareMarketplaceWalletTransfer(s,projectId,paymentId,operationId)
    authorization(approved,current,now)
    attempt.state='submitting';attempt.submissionStartedAt=now;attempt.executionAuthorization=approved;attempt.submitBefore=Math.min(approved.expiresAt,now+5000)
    const next=applyMarketplaceCommand(book,projectId,'wallet-submit:'+attempt.attemptId,{type:'result',operationId,status:'unknown',evidenceId:'wallet-attempt:'+attempt.attemptId})
    s.books[s.books.indexOf(book)]=next;return s
   })
   return {attempt:structuredClone(latest(locate(store,projectId,paymentId,operationId).book,operationId)!),transfer}
  },
  async recordSubmission(projectId:string,paymentId:string,operationId:string,token:string,transactionHash:string){
   if(typeof transactionHash!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(transactionHash))throw Error('Invalid submission transaction hash.')
   const hash=transactionHash.toLowerCase()
   await d.mutate(s=>{
    const {book}=locate(s,projectId,paymentId,operationId),attempt=latest(book,operationId)
    if(!attempt||attempt.claimToken!==token||!['submitting','submitted','unknown'].includes(attempt.state))throw Error('Wallet submission attempt does not match.')
    if(attempt.transactionHash&&attempt.transactionHash!==hash)throw Error('Wallet submission already has a different transaction.')
    if(s.books.some(b=>[...(b.bankExecutions||[]),...(b.walletExecutions||[])].some(e=>e.attemptId!==attempt.attemptId&&e.transactionHash===hash)))throw Error('Transaction is already bound to another payout.')
    attempt.transactionHash=hash;attempt.state='submitted';return s
   })
  },
  async markUncertain(projectId:string,paymentId:string,operationId:string,token:string){
   await d.mutate(s=>{const attempt=latest(locate(s,projectId,paymentId,operationId).book,operationId);if(!attempt||attempt.claimToken!==token||!['submitting','submitted','unknown'].includes(attempt.state))throw Error('Wallet submission attempt does not match.');attempt.state='unknown';return s})
  },
  async get(projectId:string,paymentId:string,operationId:string){return structuredClone(latest(locate(await d.read(),projectId,paymentId,operationId).book,operationId)||null)},
 }
}

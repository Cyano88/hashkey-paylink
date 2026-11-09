import {reserveRefundFee,settleRefundFee,type RefundFeeQuote} from './fee-reserve.js'
import {createHash,randomUUID} from 'node:crypto'
import {formatUnits,getAddress,parseEventLogs,parseAbi,type PublicClient} from 'viem'
import {createCircleDeveloperTreasuryClient,type CircleTreasuryConfig,type CircleDeveloperTransaction} from '../circle-developer-treasury.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import {applyMarketplaceCommand} from './accounting.js'
import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {RefundReservation} from './refunds.js'
import type {MarketplaceWalletEvent} from './wallet-reconciliation.js'

export type RefundExecution={feeQuote?:RefundFeeQuote;refundId:string;idempotencyKey:string;refId:string;walletId:string;state:'unknown'|'submitted'|'settled'|'failed';transactionId?:string;transactionHash?:string;evidenceId?:string;terminalEvidence?:{providerState:string;receiptStatus:'success'|'reverted';blockHash:string;blockNumber:string;finalizedBlockNumber:string;verifiedAt:number}}
export type MarketplaceRefundEvent=Omit<MarketplaceWalletEvent,'type'> & {type:'marketplace.refund.settled'|'marketplace.refund.failed';refundId:string;refundNetworkFee?:{payer:string;asset:string;quoteId:string;chargedUnits:string}}
type Circle=Pick<ReturnType<typeof createCircleDeveloperTreasuryClient>,'verifyConfiguredWallet'|'createUsdcTransfer'|'getTransaction'> & Partial<Pick<ReturnType<typeof createCircleDeveloperTreasuryClient>,'findTransferByReference'>>
type Dependencies={requireFeeReserve?:boolean;quoteFees?:(reservation:RefundReservation)=>Promise<RefundFeeQuote>;read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;enabled?:boolean;config:CircleTreasuryConfig;billsTreasuryAddress:string;holdingId:string;holdingRevision:string;circle?:Circle;chain:Pick<PublicClient,'getChainId'|'getTransactionReceipt'|'getBlock'>;authorize:(reservation:RefundReservation)=>Promise<boolean>}
const transferAbi=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])

/** Internal worker only. No default credentials, public route, or automatic resubmission after ambiguity. */
export function createMarketplaceRefundExecution(dependencies:Dependencies){
 const d={...dependencies,config:structuredClone(dependencies.config)}
 const circle=d.circle??createCircleDeveloperTreasuryClient({config:d.config})
 function locate(s:MarketplaceStore|undefined,projectId:string,paymentId:string,refundId:string){
  for(const id of [projectId,paymentId,refundId])marketplaceReference(id)
  const book=s?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId),reservation=book?.refundReservations?.find(r=>r.refundId===refundId)
  if(!book||!reservation)throw Error('Marketplace refund not found.')
  return {book,reservation,execution:book.refundExecutions?.find(e=>e.refundId===refundId)}
 }
 function gate(r:RefundReservation){
  if(!d.enabled)throw Error('Marketplace refund execution is disabled.')
  const c=r.collection
  if(!d.config.verificationReady||d.config.blockchain!=='BASE'||d.config.accountType!=='SCA'||c.asset!=='USDC'||getAddress(c.tokenAddress)!==getAddress(BASE_STABLECOINS.USDC.address)||c.network!=='base'||c.holdingId!==d.holdingId||c.holdingRevision!==d.holdingRevision||getAddress(c.holdingAddress)!==getAddress(d.config.treasuryAddress))throw Error('Marketplace refund holding is not configured for this collection.')
  if(getAddress(d.billsTreasuryAddress)===getAddress(d.config.treasuryAddress))throw Error('Marketplace holding must be separate from Bills treasury.')
 }
 function validateTransaction(tx:CircleDeveloperTransaction,transactionId:string,e:RefundExecution,r:RefundReservation){
   if(tx.id!==transactionId||tx.walletId!==e.walletId||tx.blockchain!=='BASE'||tx.transactionType!=='OUTBOUND'||tx.refId!==e.refId||getAddress(tx.sourceAddress)!==getAddress(r.collection.holdingAddress)||getAddress(tx.destinationAddress)!==getAddress(r.collection.payerWallet)||tx.amounts.length!==1||marketplaceAmountUnits(tx.amounts[0])!==r.amountUnits)throw Error('Circle transaction does not match the marketplace refund.')
 }
 return {
  async recover(projectId:string,paymentId:string,refundId:string){
   const {reservation,execution}=locate(await d.read(),projectId,paymentId,refundId);gate(reservation)
   if(!execution)throw Error('Refund was not submitted.')
   if(execution.transactionId||['settled','failed'].includes(execution.state))return structuredClone(execution)
   if(!circle.findTransferByReference)throw Error('Circle refund reference recovery is not configured.')
   const found=await circle.findTransferByReference(execution.refId)
   if(!found)return structuredClone(locate(await d.read(),projectId,paymentId,refundId).execution!)
   validateTransaction(found,found.id,execution,reservation)
   return this.attachTransaction(projectId,paymentId,refundId,found.id)
  },
  async submit(projectId:string,paymentId:string,refundId:string){
   const before=locate(await d.read(),projectId,paymentId,refundId);gate(before.reservation)
   if(before.execution)return structuredClone(before.execution)
   await circle.verifyConfiguredWallet()
   if(d.requireFeeReserve&&!d.quoteFees)throw Error('Refund fee quoting is not configured.')
   const feeQuote=d.quoteFees?structuredClone(await d.quoteFees(structuredClone(before.reservation))):undefined
   if(d.requireFeeReserve&&!feeQuote)throw Error('Refund fee quote is unavailable.')
   if(feeQuote&&(feeQuote.projectId!==projectId||feeQuote.paymentId!==paymentId||feeQuote.refundId!==refundId||feeQuote.amountUnits!==before.reservation.amountUnits))throw Error('Refund fee quote binding mismatch.')
   const authorizationStartedAt=d.now()
   if(!await d.authorize(structuredClone(before.reservation)))throw Error('Marketplace refund execution authorization denied.')
   const idempotencyKey=randomUUID(),refId='marketplace-refund:'+createHash('sha256').update(JSON.stringify([projectId,paymentId,refundId])).digest('hex')
   const saved=await d.mutate(s=>{
    const {book,reservation,execution}=locate(s,projectId,paymentId,refundId)
    if(execution)return s
    if(d.now()<authorizationStartedAt||d.now()-authorizationStartedAt>5000)throw Error('Refund execution authorization expired.')
    if(JSON.stringify(reservation)!==JSON.stringify(before.reservation))throw Error('Refund reservation changed.')
    if(feeQuote)reserveRefundFee(s,feeQuote,d.now())
    let next=book
    for(const a of reservation.allocations){
     const op=next.operations.find(o=>o.id===a.operationId)
     if(!op||op.kind!=='refund'||op.status!=='reserved'||op.units!==a.amountUnits)throw Error('Refund reservation is not executable.')
     next=applyMarketplaceCommand(next,projectId,'refund-start:'+a.operationId,{type:'result',operationId:a.operationId,status:'unknown',evidenceId:'refund-submit:'+idempotencyKey})
    }
    next.refundExecutions=[...(next.refundExecutions||[]),{...(feeQuote?{feeQuote:structuredClone(feeQuote)}:{}),refundId,idempotencyKey,refId,walletId:d.config.walletId,state:'unknown'}]
    s.books[s.books.indexOf(book)]=next;return s
   })
   const claimed=locate(saved,projectId,paymentId,refundId).execution!
   if(claimed.idempotencyKey!==idempotencyKey)return structuredClone(claimed)
   if(d.now()<authorizationStartedAt||d.now()-authorizationStartedAt>5000)throw Error('Refund submission deadline expired; recovery required.')
   // A timeout or crash leaves unknown. Never issue a second transfer on an ordinary retry.
   const created=await circle.createUsdcTransfer({idempotencyKey,refId,destinationAddress:before.reservation.collection.payerWallet,amount:formatUnits(BigInt(before.reservation.amountUnits),6),tokenAddress:before.reservation.collection.tokenAddress})
   return this.attachTransaction(projectId,paymentId,refundId,created.id)
  },
  /** Trusted recovery worker may attach a Circle ID; exact provider binding is checked first. */
  async attachTransaction(projectId:string,paymentId:string,refundId:string,transactionId:string){
   const current=locate(await d.read(),projectId,paymentId,refundId);gate(current.reservation)
   const e=current.execution,r=current.reservation
   if(!e)throw Error('Refund was not submitted.')
   const tx=await circle.getTransaction(transactionId)
   validateTransaction(tx,transactionId,e,r)
   const saved=await d.mutate(s=>{
    const {execution}=locate(s,projectId,paymentId,refundId)
    if(!execution||execution.idempotencyKey!==e.idempotencyKey)throw Error('Refund execution changed.')
    if(execution.transactionId&&execution.transactionId!==transactionId)throw Error('Refund transaction changed.')
    if(s.books.some(b=>b.refundExecutions?.some(other=>other.idempotencyKey!==e.idempotencyKey&&other.transactionId===transactionId)))throw Error('Circle transaction already used.')
    if(/^0x[0-9a-fA-F]{64}$/.test(tx.txHash)){
     const hash=tx.txHash.toLowerCase()
     if(execution.transactionHash&&execution.transactionHash!==hash)throw Error('Refund transaction hash changed; review required.')
     execution.transactionHash=hash
    }
    execution.transactionId=transactionId;if(!['settled','failed'].includes(execution.state))execution.state='submitted';return s
   })
   return structuredClone(locate(saved,projectId,paymentId,refundId).execution!)
  },
  async reconcile(projectId:string,paymentId:string,refundId:string){
   const {reservation:r,execution:e}=locate(await d.read(),projectId,paymentId,refundId);gate(r)
   if(!e?.transactionId)throw Error('Refund requires Circle transaction recovery.')
   if(['settled','failed'].includes(e.state))return structuredClone(e)
   const attached=await this.attachTransaction(projectId,paymentId,refundId,e.transactionId)
   const tx=await circle.getTransaction(e.transactionId)
   validateTransaction(tx,e.transactionId,e,r)
   if(!/^0x[0-9a-fA-F]{64}$/.test(tx.txHash))return structuredClone(e)
   if(await d.chain.getChainId()!==8453)throw Error('Refund verification requires Base.')
   const transactionHash=tx.txHash.toLowerCase() as `0x${string}`
   if(transactionHash!==attached.transactionHash)throw Error('Refund transaction hash changed; review required.')
   const receipt=await d.chain.getTransactionReceipt({hash:transactionHash})
   const finalized=await d.chain.getBlock({blockTag:'finalized'}),canonical=await d.chain.getBlock({blockNumber:receipt.blockNumber})
   if(receipt.transactionHash.toLowerCase()!==transactionHash||!['success','reverted'].includes(receipt.status)||finalized.number===null||receipt.blockNumber>finalized.number||canonical.hash!==receipt.blockHash)return structuredClone(e)
   const failed=receipt.status==='reverted'
   // A reverted attempt is insufficient while Circle may still retry that transaction.
   if(failed&&!['FAILED','CANCELLED','DENIED'].includes(tx.state))return structuredClone(attached)
   if(failed&&receipt.logs.length)throw Error('Reverted refund receipt cannot contain logs.')
   const outflows=parseEventLogs({abi:transferAbi,logs:receipt.logs}).filter(l=>getAddress(l.address)===getAddress(r.collection.tokenAddress)&&getAddress(l.args.from)===getAddress(r.collection.holdingAddress))
   const logs=outflows.filter(l=>getAddress(l.address)===getAddress(r.collection.tokenAddress)&&getAddress(l.args.from)===getAddress(r.collection.holdingAddress)&&getAddress(l.args.to)===getAddress(r.collection.payerWallet)&&l.args.value===BigInt(r.amountUnits))
   if(!failed&&(outflows.length!==1||logs.length!==1||logs[0].removed||logs[0].blockHash!==receipt.blockHash||logs[0].transactionHash!==transactionHash||logs[0].logIndex===null))throw Error('Refund requires one exact original-payer USDC transfer.')
   const status=failed?'failed' as const:'settled' as const
   const evidenceId=`base:8453:${transactionHash}:${failed?'reverted':logs[0].logIndex}`
   const saved=await d.mutate(s=>{
    const {book,execution}=locate(s,projectId,paymentId,refundId)
    if(execution&&['settled','failed'].includes(execution.state)){
     if(execution.state!==status||execution.evidenceId!==evidenceId)throw Error('Conflicting terminal refund evidence requires review.')
     return s
    }
    if(!execution||execution.transactionId!==e.transactionId||execution.transactionHash!==transactionHash)throw Error('Refund execution changed.')
    if(s.books.some(b=>b.fundingEvidence===evidenceId||b.operations.some(o=>o.evidenceId===evidenceId)||b.refundExecutions?.some(x=>x.idempotencyKey!==e.idempotencyKey&&x.transactionHash===transactionHash)||[...(b.walletExecutions||[]),...(b.bankExecutions||[])].some(x=>x.transactionHash===transactionHash)))throw Error('Refund transaction evidence already used.')
    let next=book
    for(const a of r.allocations)next=applyMarketplaceCommand(next,projectId,'refund-final:'+a.operationId,{type:'result',operationId:a.operationId,status,evidenceId:'refund-proof:'+createHash('sha256').update(JSON.stringify([evidenceId,a.operationId])).digest('hex')})
    const done=next.refundExecutions!.find(x=>x.refundId===refundId)!
    done.state=status;done.transactionHash=transactionHash;done.evidenceId=evidenceId
    done.terminalEvidence={providerState:tx.state,receiptStatus:receipt.status,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString(),finalizedBlockNumber:finalized.number!.toString(),verifiedAt:d.now()}
    next.refundEvents=[...(next.refundEvents||[]),{id:randomUUID(),type:failed?'marketplace.refund.failed':'marketplace.refund.settled',refundId,operationId:refundId,projectId,paymentId,asset:'USDC',currency:'USDC',network:'base',...(execution.feeQuote?{refundNetworkFee:{payer:'marketplace',asset:'USDC',quoteId:execution.feeQuote.quoteId,chargedUnits:failed?'0':execution.feeQuote.networkFeeUnits}}:{}),debitUnits:r.amountUnits,recipientAmountUnits:failed?'0':r.amountUnits,createdAt:d.now(),delivery:'pending'}]
    s.books[s.books.indexOf(book)]=next
    if(execution.feeQuote)settleRefundFee(s,projectId,paymentId,refundId,!failed)
    return s
   })
   return structuredClone(locate(saved,projectId,paymentId,refundId).execution!)
  },
 }
}

import {createHash,randomUUID} from 'node:crypto'
import {formatUnits,getAddress,parseEventLogs,parseAbi,type PublicClient} from 'viem'
import {createCircleDeveloperTreasuryClient,type CircleTreasuryConfig} from '../circle-developer-treasury.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import {applyMarketplaceCommand} from './accounting.js'
import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {RefundReservation} from './refunds.js'
import type {MarketplaceWalletEvent} from './wallet-reconciliation.js'

export type RefundExecution={refundId:string;idempotencyKey:string;refId:string;walletId:string;state:'unknown'|'submitted'|'settled';transactionId?:string;transactionHash?:string;evidenceId?:string}
export type MarketplaceRefundEvent=Omit<MarketplaceWalletEvent,'type'> & {type:'marketplace.refund.settled';refundId:string}
type Circle=Pick<ReturnType<typeof createCircleDeveloperTreasuryClient>,'verifyConfiguredWallet'|'createUsdcTransfer'|'getTransaction'>
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;enabled?:boolean;config:CircleTreasuryConfig;billsTreasuryAddress:string;holdingId:string;holdingRevision:string;circle?:Circle;chain:Pick<PublicClient,'getChainId'|'getTransactionReceipt'|'getBlock'>;authorize:(reservation:RefundReservation)=>Promise<boolean>}
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
 return {
  async submit(projectId:string,paymentId:string,refundId:string){
   const before=locate(await d.read(),projectId,paymentId,refundId);gate(before.reservation)
   if(before.execution)return structuredClone(before.execution)
   await circle.verifyConfiguredWallet()
   const authorizationStartedAt=d.now()
   if(!await d.authorize(structuredClone(before.reservation)))throw Error('Marketplace refund execution authorization denied.')
   const idempotencyKey=randomUUID(),refId='marketplace-refund:'+createHash('sha256').update(JSON.stringify([projectId,paymentId,refundId])).digest('hex')
   const saved=await d.mutate(s=>{
    const {book,reservation,execution}=locate(s,projectId,paymentId,refundId)
    if(execution)return s
    if(d.now()<authorizationStartedAt||d.now()-authorizationStartedAt>5000)throw Error('Refund execution authorization expired.')
    if(JSON.stringify(reservation)!==JSON.stringify(before.reservation))throw Error('Refund reservation changed.')
    let next=book
    for(const a of reservation.allocations){
     const op=next.operations.find(o=>o.id===a.operationId)
     if(!op||op.kind!=='refund'||op.status!=='reserved'||op.units!==a.amountUnits)throw Error('Refund reservation is not executable.')
     next=applyMarketplaceCommand(next,projectId,'refund-start:'+a.operationId,{type:'result',operationId:a.operationId,status:'unknown',evidenceId:'refund-submit:'+idempotencyKey})
    }
    next.refundExecutions=[...(next.refundExecutions||[]),{refundId,idempotencyKey,refId,walletId:d.config.walletId,state:'unknown'}]
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
   if(tx.id!==transactionId||tx.walletId!==e.walletId||tx.blockchain!=='BASE'||tx.transactionType!=='OUTBOUND'||tx.refId!==e.refId||getAddress(tx.sourceAddress)!==getAddress(r.collection.holdingAddress)||getAddress(tx.destinationAddress)!==getAddress(r.collection.payerWallet)||tx.amounts.length!==1||marketplaceAmountUnits(tx.amounts[0])!==r.amountUnits)throw Error('Circle transaction does not match the marketplace refund.')
   const saved=await d.mutate(s=>{
    const {execution}=locate(s,projectId,paymentId,refundId)
    if(!execution||execution.idempotencyKey!==e.idempotencyKey)throw Error('Refund execution changed.')
    if(execution.transactionId&&execution.transactionId!==transactionId)throw Error('Refund transaction changed.')
    if(s.books.some(b=>b.refundExecutions?.some(other=>other.idempotencyKey!==e.idempotencyKey&&other.transactionId===transactionId)))throw Error('Circle transaction already used.')
    execution.transactionId=transactionId;if(execution.state!=='settled')execution.state='submitted';return s
   })
   return structuredClone(locate(saved,projectId,paymentId,refundId).execution!)
  },
  async reconcile(projectId:string,paymentId:string,refundId:string){
   const {reservation:r,execution:e}=locate(await d.read(),projectId,paymentId,refundId);gate(r)
   if(!e?.transactionId)throw Error('Refund requires Circle transaction recovery.')
   if(e.state==='settled')return structuredClone(e)
   await this.attachTransaction(projectId,paymentId,refundId,e.transactionId)
   const tx=await circle.getTransaction(e.transactionId)
   if(!/^0x[0-9a-fA-F]{64}$/.test(tx.txHash))return structuredClone(e)
   if(await d.chain.getChainId()!==8453)throw Error('Refund verification requires Base.')
   const transactionHash=tx.txHash.toLowerCase() as `0x${string}`
   const receipt=await d.chain.getTransactionReceipt({hash:transactionHash})
   const finalized=await d.chain.getBlock({blockTag:'finalized'}),canonical=await d.chain.getBlock({blockNumber:receipt.blockNumber})
   if(receipt.transactionHash.toLowerCase()!==transactionHash||receipt.status!=='success'||finalized.number===null||receipt.blockNumber>finalized.number||canonical.hash!==receipt.blockHash)return structuredClone(e)
   const logs=parseEventLogs({abi:transferAbi,logs:receipt.logs}).filter(l=>getAddress(l.address)===getAddress(r.collection.tokenAddress)&&getAddress(l.args.from)===getAddress(r.collection.holdingAddress)&&getAddress(l.args.to)===getAddress(r.collection.payerWallet)&&l.args.value===BigInt(r.amountUnits))
   if(logs.length!==1||logs[0].logIndex===null)throw Error('Refund requires one exact original-payer USDC transfer.')
   const evidenceId=`base:8453:${transactionHash}:${logs[0].logIndex}`
   const saved=await d.mutate(s=>{
    const {book,execution}=locate(s,projectId,paymentId,refundId)
    if(execution?.state==='settled')return s
    if(!execution||execution.transactionId!==e.transactionId)throw Error('Refund execution changed.')
    if(s.books.some(b=>b.fundingEvidence===evidenceId||b.operations.some(o=>o.evidenceId===evidenceId)||b.refundExecutions?.some(x=>x.transactionHash===transactionHash)||[...(b.walletExecutions||[]),...(b.bankExecutions||[])].some(x=>x.transactionHash===transactionHash)))throw Error('Refund transaction evidence already used.')
    let next=book
    for(const a of r.allocations)next=applyMarketplaceCommand(next,projectId,'refund-final:'+a.operationId,{type:'result',operationId:a.operationId,status:'settled',evidenceId:evidenceId+':'+createHash('sha256').update(a.operationId).digest('hex')})
    const done=next.refundExecutions!.find(x=>x.refundId===refundId)!
    done.state='settled';done.transactionHash=transactionHash;done.evidenceId=evidenceId
    next.refundEvents=[...(next.refundEvents||[]),{id:randomUUID(),type:'marketplace.refund.settled',refundId,operationId:refundId,projectId,paymentId,asset:'USDC',currency:'USDC',network:'base',debitUnits:r.amountUnits,recipientAmountUnits:r.amountUnits,createdAt:d.now(),delivery:'pending'}]
    s.books[s.books.indexOf(book)]=next;return s
   })
   return structuredClone(locate(saved,projectId,paymentId,refundId).execution!)
  },
 }
}

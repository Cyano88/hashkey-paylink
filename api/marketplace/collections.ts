import type {PayerCheckoutFeeEvidence} from '../merchant-checkout-fees.js'
import {EVM_PLATFORM_TREASURY,paymentFeeBreakdown} from '../../src/lib/platformFees.js'
import {createHash} from 'node:crypto'
import {getAddress,parseAbi,parseEventLogs,type PublicClient} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {applyMarketplaceCommand,type MarketplaceBook} from './accounting.js'
import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {RefundCollection} from './refunds.js'

/** Supplied only by an authoritative checkout-session adapter, never request JSON.
 * Transaction hash and payer identity must already be bound to that session.
 * issuedAt/expiresAt are Unix seconds; late verification of an on-time transfer is allowed.
 */
export type MarketplaceCollectionSession={payerFees?:PayerCheckoutFeeEvidence;sessionId:string;projectId:string;paymentId:string;payerId:string;payerWallet:string;holdingId:string;holdingRevision:string;holdingAddress:string;network:'base';asset:'USDC';amountUnits:string;transactionHash:string;issuedAt:number;expiresAt:number}
export type MarketplaceCollectionProof={session:MarketplaceCollectionSession;evidenceId:string;blockHash:string;blockNumber:string;finalizedBlockNumber:string;logIndex:number;verifiedAt:number}
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;enabled?:boolean;holding:{id:string;revision:string;address:string;billsAddress:string};chain:Pick<PublicClient,'getChainId'|'getTransactionReceipt'|'getBlock'>;resolveSession:(request:{projectId:string;paymentId:string})=>Promise<MarketplaceCollectionSession|null>}
const abi=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
const hash=/^0x[0-9a-f]{64}$/i,zero='0x0000000000000000000000000000000000000000'
function locate(s:MarketplaceStore|undefined,projectId:string,paymentId:string){const book=s?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId);if(!book)throw Error('Marketplace payment not found.');return book}

/** Unmounted verifier. No deposit-address UI, arbitrary tx claims, or signing. */
export function createMarketplaceCollections(input:Dependencies){
 const d={...input,holding:structuredClone(input.holding)}
 async function invalidateObservation(projectId:string,paymentId:string,transactionHash:string){
  await d.mutate(store=>{const book=locate(store,projectId,paymentId)
   if(!book.fundingEvidence&&book.collectionObservation?.session.transactionHash===transactionHash){
    if(book.operations.length)throw Error('Unfinalized collection has operations.')
    book.collectionStatus='review_required'
    book.balances.forEach(balance=>{balance.pending='0'})
   }
   return store
  })
 }
 function binding(value:MarketplaceCollectionSession|null,book:MarketplaceBook){
  if(!value)throw Error('Authoritative collection session is unavailable.')
  const s=structuredClone(value)
  if(book.collectionCheckout&&!s.payerFees)throw Error('Marketplace checkout requires verified payer fees.')
  for(const id of [s.sessionId,s.projectId,s.paymentId,s.payerId,s.holdingId,s.holdingRevision])marketplaceReference(id)
  const holding=getAddress(d.holding.address),payer=getAddress(s.payerWallet),bills=getAddress(d.holding.billsAddress)
  if(holding===zero||payer===zero||bills===zero||holding===bills||payer===holding||payer===bills)throw Error('Collection requires an isolated holding wallet and original payer.')
  if(s.projectId!==book.plan.projectId||s.paymentId!==book.plan.paymentId||s.network!=='base'||s.asset!=='USDC'||book.plan.asset!=='USDC'||book.plan.network!=='base'||s.amountUnits!==book.plan.amountUnits||s.holdingId!==d.holding.id||s.holdingRevision!==d.holding.revision||getAddress(s.holdingAddress)!==holding||!hash.test(s.transactionHash))throw Error('Collection session does not match the payment or holding configuration.')
  if(!Number.isSafeInteger(s.issuedAt)||s.issuedAt<0||!Number.isSafeInteger(s.expiresAt)||s.expiresAt<=s.issuedAt)throw Error('Invalid collection session lifetime.')
  return {...s,payerWallet:payer,holdingAddress:holding,transactionHash:s.transactionHash.toLowerCase()}
 }
  async function verifyCollection(projectId:string,paymentId:string,requireFinality:boolean){
   if(!d.enabled)throw Error('Marketplace collection verification is disabled.')
   marketplaceReference(projectId);marketplaceReference(paymentId)
   const before=locate(await d.read(),projectId,paymentId),request={projectId,paymentId}
   // Recheck the previous inclusion before asking the checkout adapter to
   // reverify fees. A dropped transaction can make that adapter fail first;
   // the old block still supplies positive evidence of a reorganization.
   if(!before.fundingEvidence&&before.collectionObservation){
    if(await d.chain.getChainId()!==8453)throw Error('Collection verification requires Base.')
    const previous=before.collectionObservation
    const block=await d.chain.getBlock({blockNumber:BigInt(previous.blockNumber)})
    if(block.number===BigInt(previous.blockNumber)&&block.hash&&block.hash.toLowerCase()!==previous.blockHash.toLowerCase())await invalidateObservation(projectId,paymentId,previous.session.transactionHash)
   }
   const session=binding(await d.resolveSession(request),before)
   if(await d.chain.getChainId()!==8453)throw Error('Collection verification requires Base.')
   const receipt=await d.chain.getTransactionReceipt({hash:session.transactionHash as `0x${string}`})
   if(receipt.status!=='success'||receipt.transactionHash.toLowerCase()!==session.transactionHash||!hash.test(receipt.blockHash)||receipt.blockNumber<0n){
    if(receipt.status==='reverted'&&receipt.transactionHash.toLowerCase()===session.transactionHash)await invalidateObservation(projectId,paymentId,session.transactionHash)
    throw Error('Collection receipt is not a successful matching transaction.')
   }
   const [finalized,canonical]=await Promise.all([d.chain.getBlock({blockTag:'finalized'}),d.chain.getBlock({blockNumber:receipt.blockNumber})])
   if(canonical.number!==receipt.blockNumber||canonical.hash?.toLowerCase()!==receipt.blockHash.toLowerCase()){
    await invalidateObservation(projectId,paymentId,session.transactionHash)
    throw Error('Collection is not canonical and finalized.')
   }
   if(finalized.number===null||requireFinality&&receipt.blockNumber>finalized.number)throw Error('Collection is not canonical and finalized.')
   if(canonical.timestamp<BigInt(session.issuedAt)||canonical.timestamp>BigInt(session.expiresAt))throw Error('Collection transfer is outside its checkout session lifetime.')
   const token=getAddress(BASE_STABLECOINS.USDC.address)
   const logs=parseEventLogs({abi,logs:receipt.logs}).filter(log=>getAddress(log.address)===token)
   const incoming=logs.filter(log=>getAddress(log.args.to)===session.holdingAddress)
   if(incoming.length!==1||getAddress(incoming[0].args.from)!==session.payerWallet||incoming[0].args.value!==BigInt(session.amountUnits)||logs.some(log=>getAddress(log.args.from)===session.holdingAddress))throw Error('Collection requires one exact payer-to-holding USDC transfer and no holding outflow.')
   const log=incoming[0]
   if(!Number.isSafeInteger(log.logIndex)||log.logIndex===null||log.logIndex<0||log.removed||log.transactionHash?.toLowerCase()!==session.transactionHash||log.blockHash?.toLowerCase()!==receipt.blockHash.toLowerCase()||log.blockNumber!==receipt.blockNumber)throw Error('Collection transfer log does not match its receipt.')
   if(session.payerFees){
    const fees=session.payerFees,treasury=getAddress(EVM_PLATFORM_TREASURY)
    if(treasury===session.holdingAddress||treasury===session.payerWallet||getAddress(fees.treasuryAddress)!==treasury||!fees.quoteId)throw Error('Marketplace fee destination is invalid.')
    for(const value of [fees.platformFeeUnits,fees.networkFeeUnits,fees.treasuryUnits,fees.totalUnits])if(!/^(0|[1-9]\d{0,30})$/.test(value))throw Error('Invalid Marketplace fee units.')
    const amounts=paymentFeeBreakdown(BigInt(session.amountUnits),BigInt(fees.networkFeeUnits),'gross')
    if(amounts.platformFee.toString()!==fees.platformFeeUnits||amounts.treasury.toString()!==fees.treasuryUnits||amounts.total.toString()!==fees.totalUnits)throw Error('Marketplace payer fee totals changed.')
    const feeLogs=logs.filter(l=>getAddress(l.args.from)===session.payerWallet&&getAddress(l.args.to)===treasury)
    if(amounts.treasury===0n?feeLogs.length!==0:feeLogs.length!==1||feeLogs[0].args.value!==amounts.treasury)throw Error('Marketplace requires the exact payer-to-treasury fee transfer.')
    if(feeLogs.some(l=>l.removed||l.logIndex===null||!Number.isSafeInteger(l.logIndex)||l.logIndex<0||l.transactionHash?.toLowerCase()!==session.transactionHash||l.blockHash?.toLowerCase()!==receipt.blockHash.toLowerCase()||l.blockNumber!==receipt.blockNumber))throw Error('Marketplace fee log does not match its receipt.')
    const payerOutflows=logs.filter(l=>getAddress(l.args.from)===session.payerWallet)
    if(payerOutflows.length!==(amounts.treasury===0n?1:2)||payerOutflows.reduce((sum,l)=>sum+l.args.value,0n)!==amounts.total)throw Error('Marketplace payer debit differs from the accepted total.')
   }
   const latest=binding(await d.resolveSession(request),before)
   if(JSON.stringify(latest)!==JSON.stringify(session))throw Error('Collection session changed during verification.')
   const verifiedAt=d.now()
   if(!Number.isSafeInteger(verifiedAt)||verifiedAt<0)throw Error('Invalid collection verification time.')
   const evidenceId=`base:8453:${session.transactionHash}:${log.logIndex}`
   const proof:MarketplaceCollectionProof={session,evidenceId,blockHash:receipt.blockHash.toLowerCase(),blockNumber:receipt.blockNumber.toString(),finalizedBlockNumber:finalized.number.toString(),logIndex:log.logIndex,verifiedAt}
   const origin:RefundCollection={projectId,paymentId,fundingEvidenceId:evidenceId,route:'wallet',network:'base',asset:'USDC',tokenAddress:token,amountUnits:session.amountUnits,payerId:session.payerId,payerWallet:session.payerWallet,holdingId:session.holdingId,holdingRevision:session.holdingRevision,holdingAddress:session.holdingAddress}
   const saved=await d.mutate(store=>{
    const book=locate(store,projectId,paymentId)
    if(JSON.stringify(book.plan)!==JSON.stringify(before.plan))throw Error('Marketplace payment changed during verification.')
    if(book.collectionProof){
     if(book.collectionProof.evidenceId!==evidenceId||JSON.stringify(book.collectionProof.session)!==JSON.stringify(session)||book.collectionProof.blockHash!==proof.blockHash||book.fundingEvidence!==evidenceId||JSON.stringify(book.refundCollection)!==JSON.stringify(origin))throw Error('Conflicting collection proof requires review.')
     return store
    }
    if(book.collectionObservation&&JSON.stringify(book.collectionObservation.session)!==JSON.stringify(session))throw Error('Conflicting collection observation requires review.')
    if(store.books.some(b=>b!==book&&(b.fundingEvidence===evidenceId||b.collectionObservation?.session.sessionId===session.sessionId||b.collectionObservation?.session.transactionHash===session.transactionHash||b.collectionProof?.session.sessionId===session.sessionId||b.collectionProof?.session.transactionHash===session.transactionHash||b.operations.some(o=>o.evidenceId===evidenceId)||[...(b.walletExecutions||[]),...(b.bankExecutions||[]),...(b.refundExecutions||[])].some(e=>e.transactionHash?.toLowerCase()===session.transactionHash))))throw Error('Collection transaction or session was already used.')
    if(book.operations.some(o=>o.evidenceId===evidenceId)||[...(book.walletExecutions||[]),...(book.bankExecutions||[]),...(book.refundExecutions||[])].some(e=>e.transactionHash?.toLowerCase()===session.transactionHash))throw Error('Collection transaction was already used.')
    if(!requireFinality){
     if(book.fundingEvidence||book.operations.length||book.balances.some(b=>[b.available,b.reserved,b.paid,b.refunded,b.feesFunded??'0',b.feesAccrued??'0'].some(v=>v!=='0')))throw Error('Unfinalized collection has spendable balances.')
     book.collectionObservation=proof;book.collectionStatus='pending_finality'
     book.balances.forEach(b=>{b.pending=book.plan.allocations.find(a=>a.id===b.allocationId)!.amountUnits})
     return store
    }
    const next=applyMarketplaceCommand(book,projectId,'collection:'+createHash('sha256').update(session.sessionId).digest('hex'),{type:'fund',evidenceId,network:'base',asset:'USDC',amountUnits:session.amountUnits})
    next.collectionProof=proof;next.collectionStatus='finalized';next.refundCollection=origin;store.books[store.books.indexOf(book)]=next;return store
   })
   const book=locate(saved,projectId,paymentId)
   return structuredClone(book.collectionProof??book.collectionObservation!)
  }
 return {
  observe:(projectId:string,paymentId:string)=>verifyCollection(projectId,paymentId,false),
  verify:(projectId:string,paymentId:string)=>verifyCollection(projectId,paymentId,true),
  async sync(projectId:string,paymentId:string){
   const observation=await verifyCollection(projectId,paymentId,false)
   if(BigInt(observation.blockNumber)<=BigInt(observation.finalizedBlockNumber))await verifyCollection(projectId,paymentId,true)
   return structuredClone(locate(await d.read(),projectId,paymentId))
  },
  async resolveRefundCollection(request:{projectId:string;paymentId:string;fundingEvidenceId:string}):Promise<RefundCollection|null>{
   const book=locate(await d.read(),request.projectId,request.paymentId)
   if(!book.collectionProof||book.fundingEvidence!==request.fundingEvidenceId||book.collectionProof.evidenceId!==request.fundingEvidenceId||book.refundCollection?.fundingEvidenceId!==request.fundingEvidenceId)return null
   return structuredClone(book.refundCollection)
  },
 }
}

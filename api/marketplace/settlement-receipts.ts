import {createHash} from 'node:crypto'
import type {PaylinkReceipt} from '../../src/lib/paymentReceiptPdf.js'
import {formatUnits,getAddress} from 'viem'
import type {MarketplaceStore} from './repository.js'
import {marketplaceBankReceipt} from './bank-receipt.js'
import {marketplaceWalletReceipt} from './wallet-receipt.js'
export type MarketplaceSettlementReceipt={allocationRole?:'seller'|'platform';bankFees?:PaylinkReceipt['marketplaceBankFees'];settlement?:'bank';sellerId?:string;currency?:'NGN';providerFee?:string;commission?:string;id:string;projectId:string;marketplaceName?:string;paymentId:string;kind:'refund'|'payout';recipient:string;sender:string;amount:string;debitAmount:string;networkFee:string;feePayer:'marketplace'|'seller'|'platform';transactionHash:string;settledAt:number}
const hash=/^0x[0-9a-f]{64}$/i
/** Read-only projection from finalized accounting evidence. Never a send instruction. */
export function marketplaceSettlementReceipts(store:MarketplaceStore|undefined):MarketplaceSettlementReceipt[]{
 const rows:MarketplaceSettlementReceipt[]=[]
 const id=(project:string,payment:string,kind:string,operation:string)=>'marketplace-'+kind+'-'+createHash('sha256').update(JSON.stringify([project,payment,kind,operation])).digest('hex')
 for(const book of store?.books||[]){
  const origin=book.refundCollection
  if(!origin||book.plan.network!=='base'||book.plan.asset!=='USDC'||!book.fundingEvidence||book.collectionProof?.evidenceId!==book.fundingEvidence||origin.fundingEvidenceId!==book.fundingEvidence)continue
  for(const e of book.refundExecutions||[]){
   try {
   const r=book.refundReservations?.find(r=>r.refundId===e.refundId),proof=e.terminalEvidence
   if(e.state!=='settled'||!r||!proof||proof.receiptStatus!=='success'||!hash.test(e.transactionHash||'')||!/^\d+$/.test(proof.blockNumber)||!/^\d+$/.test(proof.finalizedBlockNumber)||BigInt(proof.blockNumber)>BigInt(proof.finalizedBlockNumber)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<0)continue
   if(r.collection.payerWallet.toLowerCase()!==origin.payerWallet.toLowerCase()||r.collection.holdingAddress.toLowerCase()!==origin.holdingAddress.toLowerCase()||r.collection.fundingEvidenceId!==book.fundingEvidence||!r.allocations.length||r.allocations.some(a=>!book.operations.some(o=>o.id===a.operationId&&o.kind==='refund'&&o.status==='settled'&&o.units===a.amountUnits))||r.allocations.reduce((n,a)=>n+BigInt(a.amountUnits),0n)!==BigInt(r.amountUnits))continue
   rows.push({id:id(book.plan.projectId,book.plan.paymentId,'refund',r.refundId),projectId:book.plan.projectId,paymentId:book.plan.paymentId,kind:'refund',recipient:getAddress(origin.payerWallet),sender:getAddress(origin.holdingAddress),amount:formatUnits(BigInt(r.amountUnits),6),debitAmount:formatUnits(BigInt(r.amountUnits),6),networkFee:formatUnits(BigInt(e.feeQuote?.networkFeeUnits||'0'),6),feePayer:'marketplace',transactionHash:e.transactionHash!,settledAt:proof.verifiedAt})
   } catch { /* Malformed legacy evidence must not suppress other valid receipts. */ }
  }
  for(const reservation of book.bankReservations||[]){
   try{const q=reservation.quote,proof=book.bankReconciliations?.find(r=>r.evidence.operationId===q.operationId);if(proof?.status!=='settled'||proof.evidence.basis!=='bank_settled')continue
    const receipt=marketplaceBankReceipt(book,q.operationId);if(!hash.test(receipt.txHash))continue
    rows.push({id:id(book.plan.projectId,book.plan.paymentId,'bank-payout',q.operationId),projectId:book.plan.projectId,paymentId:book.plan.paymentId,kind:'payout',settlement:'bank',bankFees:receipt.marketplaceBankFees,allocationRole:q.withdrawal?.role??book.plan.allocations.find(a=>a.id===q.allocationId)?.role,sellerId:q.withdrawal?.sellerId??book.plan.allocations.find(a=>a.id===q.allocationId)?.sellerId,currency:'NGN',recipient:receipt.recipient!,sender:getAddress(origin.holdingAddress),amount:formatUnits(BigInt(q.ngnMinor),2),debitAmount:formatUnits(BigInt(q.debitUnits),6),networkFee:formatUnits(BigInt(q.networkFeeUnits??'0'),6),commission:formatUnits(BigInt(q.commissionUnits??'0'),6),providerFee:formatUnits(BigInt(q.feeUnits)-BigInt(q.commissionUnits??'0'),6),feePayer:(q.withdrawal?.role??book.plan.allocations.find(a=>a.id===q.allocationId)?.role)==='platform'?'platform':'seller',transactionHash:receipt.txHash,settledAt:receipt.createdAt})
   }catch{/* Only verified final bank receipts are projected. */}
  }
  for(const reservation of book.walletReservations||[]){
   try {
   if(!book.operations.some(o=>o.id===reservation.operationId&&o.status==='settled'))continue
   const receipt=marketplaceWalletReceipt(book,reservation.operationId),fees=receipt.marketplaceWalletFees!,allocation=book.plan.allocations?.find(a=>a.id===reservation.allocationId)
   if(!hash.test(receipt.txHash)||receipt.payer.toLowerCase()!==origin.holdingAddress.toLowerCase()||receipt.recipient?.toLowerCase()!==reservation.recipient.toLowerCase()||!Number.isSafeInteger(receipt.createdAt)||receipt.createdAt<0)continue
   rows.push({id:id(book.plan.projectId,book.plan.paymentId,'payout',reservation.operationId),projectId:book.plan.projectId,paymentId:book.plan.paymentId,kind:'payout',sellerId:reservation.quote?.withdrawal?.sellerId??allocation?.sellerId,allocationRole:reservation.quote?.withdrawal?.role??allocation?.role,recipient:getAddress(reservation.recipient),sender:getAddress(origin.holdingAddress),amount:receipt.amount,debitAmount:formatUnits(BigInt(fees.debitUnits),6),networkFee:formatUnits(BigInt(fees.networkFeeUnits),6),feePayer:(reservation.quote?.withdrawal?.role??allocation?.role)==='platform'?'platform':'seller',transactionHash:receipt.txHash,settledAt:receipt.createdAt})
   } catch { /* A legacy payout without verified fee evidence is not a receipt. */ }
  }
 }
 return rows
}

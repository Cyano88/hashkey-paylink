import {formatUnits} from 'viem'
import type {PaylinkReceipt} from '../../src/lib/paymentReceiptPdf.js'
import type {MarketplaceBook} from './accounting.js'
import {validateMarketplaceWalletQuote} from './wallet-quotes.js'

/** Caller must authenticate project access. Never infer settlement from a quote. */
export function marketplaceWalletReceipt(book:MarketplaceBook,operationId:string):PaylinkReceipt {
 const r=book.walletReservations?.find(r=>r.operationId===operationId),op=book.operations.find(o=>o.id===operationId)
 const result=book.walletReconciliations?.find(x=>x.evidence.operationId===operationId)
 if(!r?.quote||!op||!result||!['settled','failed'].includes(op.status)||op.status!==result.status)throw Error('Final marketplace payout receipt is not available.')
 const q=validateMarketplaceWalletQuote(r.quote),success=op.status==='settled',e=result.evidence
 if(q.debitUnits!==op.units||q.recipientUnits!==r.amountUnits||e.transferredUnits!==(success?q.recipientUnits:'0'))throw Error('Marketplace receipt amounts do not match verified settlement.')
 const id='marketplace:'+book.plan.projectId+':'+operationId
 return {type:'money_out',receiptId:id,receiptHash:e.transactionHash,eventId:operationId,txHash:e.transactionHash,title:'Marketplace withdrawal',status:success?'confirmed':'failed',chain:'base',payer:e.sender,recipient:e.recipient,destination:e.recipient,memo:'',amount:formatUnits(BigInt(e.transferredUnits),6),asset:'USDC',createdAt:e.finalizedAt,source:'marketplace_wallet',referenceId:operationId,
  marketplaceWalletFees:{quoteId:q.quoteId,debitUnits:success?q.debitUnits:'0',recipientUnits:e.transferredUnits,networkFeeUnits:success?q.networkFeeUnits:'0',feePolicy:q.feePolicy}}
}

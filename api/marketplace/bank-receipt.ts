import {formatUnits} from 'viem'
import type {PaylinkReceipt} from '../../src/lib/paymentReceiptPdf.js'
import type {MarketplaceBook} from './accounting.js'
import {bankFeeDisclosure} from './bank-quotes.js'

/** Project authorization belongs to the caller; only verified final evidence
 * can produce a receipt. Never expose decrypted bank account details. */
export function marketplaceBankReceipt(book:MarketplaceBook,operationId:string):PaylinkReceipt {
 const q=book.bankReservations?.find(r=>r.quote.operationId===operationId)?.quote,op=book.operations.find(o=>o.id===operationId)
 const result=book.bankReconciliations?.find(r=>r.evidence.operationId===operationId)
 if(!q||q.networkFeeUnits===undefined||!op||!result||!['settled','failed'].includes(op.status)||result.status!==op.status)throw Error('Final marketplace bank receipt is not available.')
 const success=op.status==='settled',e=result.evidence,bank=book.beneficiarySnapshots?.find(b=>b.beneficiaryId===q.beneficiaryId)
 if(q.debitUnits!==op.units||e.fundingUnits!==q.fundingUnits||e.ngnPaidMinor!==(success?q.ngnMinor:'0')||bank?.kind!=='bank')throw Error('Bank receipt does not match verified settlement.')
 return {type:'money_out',receiptId:'marketplace:'+book.plan.projectId+':'+operationId,receiptHash:e.fundingTransactionHash,eventId:operationId,txHash:e.fundingTransactionHash,title:'Marketplace bank withdrawal',status:success?'confirmed':'failed',chain:'base',payer:q.refundAddress,recipient:'Bank account ending '+bank.last4,destination:'Bank account ending '+bank.last4,memo:'',amount:formatUnits(BigInt(success?q.debitUnits:'0'),6),asset:'USDC',createdAt:e.finalizedAt,source:'marketplace_bank',referenceId:operationId,
  marketplaceBankFees:{...bankFeeDisclosure(q,success),debitUnits:success?q.debitUnits:'0',ngnPaidMinor:e.ngnPaidMinor}}
}

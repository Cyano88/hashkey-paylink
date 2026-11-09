import {getAddress} from 'viem'
import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import {marketplaceReference} from './beneficiaries.js'
import type {BankBeneficiary,BankDetails} from './bank-beneficiaries.js'
import type {MarketplaceBook} from './accounting.js'

/** Internal preparation only: does not quote, reserve, create an order, sign or mark a payout paid. */
export function prepareMarketplaceBankPayout(input:{book:MarketplaceBook;allocationId:string;operationId:string;currentBeneficiary:BankBeneficiary;debitUsdc:string;ngnAmount:string;maximumFeeUsdc:string;holdingRefundAddress:string},decrypt:(b:BankBeneficiary)=>BankDetails){
 const {book}=input
 marketplaceReference(input.operationId)
 if(!book.fundingEvidence||book.plan.asset!=='USDC'||book.plan.network!=='base')throw Error('Bank payout requires verified Base USDC funding.')
 const allocation=book.plan.allocations.find(a=>a.id===input.allocationId)
 const snapshot=book.beneficiarySnapshots?.find(b=>b.beneficiaryId===allocation?.beneficiaryId)
 const current=input.currentBeneficiary
 if(!allocation||allocation.settlement!=='cash_balance'||!snapshot||snapshot.kind!=='bank'||current.kind!=='bank'||current.status!=='active'||current.projectId!==book.plan.projectId||current.sellerId!==allocation.sellerId||current.beneficiaryId!==snapshot.beneficiaryId||current.destinationDigest!==snapshot.destinationDigest||current.asset!=='USDC'||current.network!=='base'||current.currency!=='NGN')throw Error('Bank payout destination is not eligible.')
 if(book.operations.some(o=>o.id===input.operationId))throw Error('Operation already exists; reconcile or retrieve it before preparing another payout.')
 const debitUnits=marketplaceAmountUnits(input.debitUsdc)
 const available=book.balances.find(b=>b.allocationId===allocation.id)?.available||'0'
 if(BigInt(debitUnits)>BigInt(available))throw Error('Bank payout exceeds released available funds.')
 const maximumFeeUnits=input.maximumFeeUsdc==='0'?'0':marketplaceAmountUnits(input.maximumFeeUsdc)
 if(BigInt(maximumFeeUnits)>=BigInt(debitUnits))throw Error('Fee budget must leave a positive payout principal.')
 if(typeof input.ngnAmount!=='string'||!/^(0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(input.ngnAmount)||BigInt(input.ngnAmount.replace('.',''))===0n)throw Error('Use a positive NGN amount with at most two decimal places.')
 const refundAddress=getAddress(input.holdingRefundAddress)
 if(refundAddress==='0x0000000000000000000000000000000000000000')throw Error('A verified holding refund address is required.')
 const bank=decrypt(snapshot)
 return {projectId:book.plan.projectId,paymentId:book.plan.paymentId,allocationId:allocation.id,operationId:input.operationId,beneficiaryId:snapshot.beneficiaryId,destinationDigest:snapshot.destinationDigest,network:'base' as const,asset:'USDC' as const,currency:'NGN' as const,debitUnits,maximumFeeUnits,ngnAmount:input.ngnAmount,refundAddress,
  // Sensitive, ephemeral provider request material. Never return this object from a developer route or journal it.
  bank,requiresProviderQuote:true as const}
}

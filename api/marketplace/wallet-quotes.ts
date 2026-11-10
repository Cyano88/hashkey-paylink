import {validateWithdrawalPlan,type WithdrawalPlan} from './withdrawal-plan.js'
import {getAddress} from 'viem'
import {marketplaceReference} from './beneficiaries.js'

/** Trusted server-issued fixed fee. Charged only on successful payout; provider
 * gas is funded externally. No second token transfer or automatic fee sweep. */
export type MarketplaceWalletQuote = {
 withdrawal?:WithdrawalPlan;
 quoteId:string;projectId:string;paymentId:string;operationId:string;allocationId:string;beneficiaryId:string;
 recipient:string;asset:'USDC';network:'base';feePayer:'allocation';feePolicy:'fixed_success_only';
 debitUnits:string;recipientUnits:string;networkFeeUnits:string;issuedAt:number;expiresAt:number;
}
export function validateMarketplaceWalletQuote(value:MarketplaceWalletQuote,now?:number):MarketplaceWalletQuote {
 const q=structuredClone(value)
 for(const k of ['quoteId','projectId','paymentId','operationId','allocationId','beneficiaryId'] as const)marketplaceReference(q[k])
 if(q.asset!=='USDC'||q.network!=='base'||q.feePayer!=='allocation'||q.feePolicy!=='fixed_success_only')throw Error('Unsupported wallet fee quote policy.')
 for(const k of ['debitUnits','recipientUnits','networkFeeUnits'] as const)if(typeof q[k]!=='string'||!/^(0|[1-9]\d{0,23})$/.test(q[k]))throw Error('Invalid wallet quote units.')
 if(BigInt(q.recipientUnits)<=0n||BigInt(q.debitUnits)!==BigInt(q.recipientUnits)+BigInt(q.networkFeeUnits))throw Error('Wallet quote debit must equal recipient amount plus network fee.')
 q.recipient=getAddress(q.recipient)
 if(/^0x0{40}$/i.test(q.recipient))throw Error('Invalid wallet quote recipient.')
 if(!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt<0||q.expiresAt<=q.issuedAt||q.expiresAt-q.issuedAt>300000)throw Error('Invalid wallet quote lifetime.')
 if(now!==undefined&&(!Number.isSafeInteger(now)||now<q.issuedAt||q.expiresAt<=now+5000))throw Error('Wallet quote expired; request a new quote.')
 return {...(q.withdrawal?{withdrawal:validateWithdrawalPlan(q.withdrawal,q.projectId,q.paymentId,q.allocationId,q.beneficiaryId,q.debitUnits)}:{}),quoteId:q.quoteId,projectId:q.projectId,paymentId:q.paymentId,operationId:q.operationId,allocationId:q.allocationId,beneficiaryId:q.beneficiaryId,recipient:q.recipient,asset:q.asset,network:q.network,feePayer:q.feePayer,feePolicy:q.feePolicy,debitUnits:q.debitUnits,recipientUnits:q.recipientUnits,networkFeeUnits:q.networkFeeUnits,issuedAt:q.issuedAt,expiresAt:q.expiresAt}
}
export function walletFeeDisclosure(q:MarketplaceWalletQuote,settled?:boolean){
 return {quoteId:q.quoteId,feePayer:q.feePayer,feePolicy:q.feePolicy,asset:q.asset,quotedDebitUnits:q.debitUnits,quotedRecipientUnits:q.recipientUnits,quotedNetworkFeeUnits:q.networkFeeUnits,
  ...(settled===undefined?{}:{chargedNetworkFeeUnits:settled?q.networkFeeUnits:'0'}),expiresAt:q.expiresAt}
}

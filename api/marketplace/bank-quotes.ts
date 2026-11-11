import {MARKETPLACE_BANK_COMMISSION_BPS,marketplaceBankCommission} from './bank-commission.js'
import {validateWithdrawalPlan,type WithdrawalPlan} from './withdrawal-plan.js'
import {getAddress,parseUnits} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceReference} from './beneficiaries.js'

/** Trusted adapter output, never a developer request body. feeUnits includes commission plus the provider transaction fee. */
export type MarketplaceBankQuote={
 withdrawal?:WithdrawalPlan;
 commissionUnits?:string;commissionRateBps?:number;commissionMode?:'fixed_units';
 exchangeRate?:string;networkFeeUnits?:string;feePolicy?:'fixed_success_only';
 quoteId:string;projectId:string;paymentId:string;allocationId:string;operationId:string;beneficiaryId:string;destinationDigest:string;
 provider:'paycrest';providerOrderId:string;intentId:string;network:'base';asset:'USDC';tokenAddress:string;currency:'NGN';
 debitUnits:string;fundingUnits:string;netUnits:string;feeUnits:string;maximumFeeUnits:string;feePayer:'allocation';ngnMinor:string;requestedNgnMinor:string;
 holdingId:string;holdingRevision:string;refundAddress:string;fundingAddress:string;issuedAt:number;expiresAt:number;status:'initiated';submitted:false
}
export type BankQuoteAuthorization={credentialId:string;businessReference:string}
export type BankQuoteReservation={key:string;requestHash:string;quote:MarketplaceBankQuote;authorization:BankQuoteAuthorization}
function units(value:unknown,allowZero=false):bigint{
 if(typeof value!=='string'||!(allowZero?/^(0|[1-9]\d{0,23})$/:/^[1-9]\d{0,23}$/).test(value))throw Error('Invalid bank quote amount units.')
 return BigInt(value)
}
function address(value:string){const result=getAddress(value);if(result==='0x0000000000000000000000000000000000000000')throw Error('Invalid bank quote address.');return result}
export function validateMarketplaceBankQuote(input:MarketplaceBankQuote,now:number):MarketplaceBankQuote{
 for(const key of ['quoteId','projectId','paymentId','allocationId','operationId','beneficiaryId','providerOrderId','intentId','holdingId','holdingRevision'] as const)marketplaceReference(input[key])
 if(input.provider!=='paycrest'||input.network!=='base'||input.asset!=='USDC'||input.currency!=='NGN'||input.feePayer!=='allocation'||input.status!=='initiated'||input.submitted!==false)throw Error('Bank quote is not eligible for marketplace funding.')
 if(typeof input.destinationDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.destinationDigest))throw Error('Invalid bank quote destination binding.')
 if(address(input.tokenAddress)!==getAddress(BASE_STABLECOINS.USDC.address))throw Error('Bank quote token does not match Base USDC.')
 const debit=units(input.debitUnits),funding=units(input.fundingUnits),net=units(input.netUnits),fee=units(input.feeUnits,true),maximum=units(input.maximumFeeUnits,true)
 const network=units(input.networkFeeUnits??'0',true)
 const commission=units(input.commissionUnits??'0',true)
 if(input.commissionMode!==undefined&&(input.commissionMode!=='fixed_units'||input.commissionUnits===undefined))throw Error('Invalid bank commission mode.')
 if(input.commissionUnits!==undefined||input.commissionRateBps!==undefined){if(input.commissionUnits===undefined||input.commissionRateBps!==MARKETPLACE_BANK_COMMISSION_BPS||commission!==marketplaceBankCommission(net)||commission>fee)throw Error('Bank quote commission changed; review a new quote.')}
 if((input.networkFeeUnits!==undefined||input.feePolicy!==undefined)&&(input.networkFeeUnits===undefined||input.feePolicy!=='fixed_success_only'))throw Error('Invalid bank network fee policy.')
 if(debit!==funding+network||net+fee!==funding||fee+network>maximum||maximum>=debit)throw Error('Bank quote debit or fees changed; review a new quote.')
 if(input.networkFeeUnits!==undefined){
  if(typeof input.exchangeRate!=='string'||!/^(0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(input.exchangeRate))throw Error('Bank quote exchange rate is required.')
  const rate=parseUnits(input.exchangeRate,18)
  if(rate<=0n||(net*rate+5n*10n**21n)/10n**22n!==units(input.ngnMinor))throw Error('Bank quote exchange rate does not match NGN amount.')
 }
 if(units(input.ngnMinor)!==units(input.requestedNgnMinor))throw Error('Bank quote NGN amount changed; review a new quote.')
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(input.issuedAt)||!Number.isSafeInteger(input.expiresAt)||input.issuedAt>now||input.expiresAt<=now+90_000||input.expiresAt<=input.issuedAt)throw Error('Bank quote is expired or too close to expiry.')
 // Whitelist persisted terms. Raw provider payloads, account numbers and credentials are excluded.
 return {...(input.commissionMode?{commissionMode:input.commissionMode}:{}),...(input.commissionUnits!==undefined?{commissionUnits:input.commissionUnits,commissionRateBps:input.commissionRateBps}:{}),...(input.withdrawal?{withdrawal:validateWithdrawalPlan(input.withdrawal,input.projectId,input.paymentId,input.allocationId,input.beneficiaryId,input.debitUnits)}:{}),...(input.networkFeeUnits!==undefined?{exchangeRate:input.exchangeRate,networkFeeUnits:input.networkFeeUnits,feePolicy:'fixed_success_only' as const}:{}),quoteId:input.quoteId,projectId:input.projectId,paymentId:input.paymentId,allocationId:input.allocationId,operationId:input.operationId,beneficiaryId:input.beneficiaryId,destinationDigest:input.destinationDigest,provider:'paycrest',providerOrderId:input.providerOrderId,intentId:input.intentId,network:'base',asset:'USDC',tokenAddress:address(input.tokenAddress),currency:'NGN',debitUnits:input.debitUnits,fundingUnits:input.fundingUnits,netUnits:input.netUnits,feeUnits:input.feeUnits,maximumFeeUnits:input.maximumFeeUnits,feePayer:'allocation',ngnMinor:input.ngnMinor,requestedNgnMinor:input.requestedNgnMinor,holdingId:input.holdingId,holdingRevision:input.holdingRevision,refundAddress:address(input.refundAddress),fundingAddress:address(input.fundingAddress),issuedAt:input.issuedAt,expiresAt:input.expiresAt,status:'initiated',submitted:false}
}

export function bankFeeDisclosure(q:MarketplaceBankQuote,settled?:boolean){
 const commission=q.commissionUnits??'0',providerFee=(BigInt(q.feeUnits)-BigInt(commission)).toString()
 return {...(q.exchangeRate?{exchangeRate:q.exchangeRate}:{}),quoteId:q.quoteId,asset:q.asset,currency:q.currency,commissionUnits:commission,...(q.commissionRateBps!==undefined?{commissionRateBps:q.commissionRateBps}:{}),feePayer:q.feePayer,feePolicy:q.feePolicy??'provider_only',quotedDebitUnits:q.debitUnits,conversionUnits:q.netUnits,providerFeeUnits:providerFee,networkFeeUnits:q.networkFeeUnits??'0',fundingUnits:q.fundingUnits,ngnMinor:q.ngnMinor,expiresAt:q.expiresAt,
  ...(settled===undefined?{}:{chargedCommissionUnits:settled?commission:'0',chargedProviderFeeUnits:settled?providerFee:'0',chargedNetworkFeeUnits:settled?(q.networkFeeUnits??'0'):'0'})}
}

import {validateFeeRouting,type FeeRouting} from './platformFees.js'
import {getAddress,parseUnits} from 'viem'
import {marketplaceFeeAmount} from './marketplaceFeeDisplay.js'
export type PayerCheckoutFeeEvidence=FeeRouting & {quoteId:string;treasuryAddress:string;platformFeeUnits:string;networkFeeUnits:string;treasuryUnits:string;totalUnits:string}
/** Validate persisted verified amounts, without repricing historical receipts. */
export function validatePayerCheckoutFees(amount:string,f:PayerCheckoutFeeEvidence):PayerCheckoutFeeEvidence {
 if(!/^(0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(amount)||parseUnits(amount,6)<=0n)throw Error('Invalid payer fee principal.')
 if(typeof f.quoteId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/.test(f.quoteId))throw Error('Invalid payer fee quote.')
 for(const k of ['platformFeeUnits','networkFeeUnits','treasuryUnits','totalUnits'] as const)if(typeof f[k]!=='string'||!/^(0|[1-9]\d{0,23})$/.test(f[k]))throw Error('Invalid payer fee units.')
 if(BigInt(f.platformFeeUnits)+BigInt(f.networkFeeUnits)!==BigInt(f.treasuryUnits)||parseUnits(amount,6)+BigInt(f.treasuryUnits)!==BigInt(f.totalUnits))throw Error('Payer fee totals do not match.')
 validateFeeRouting(f)
 const treasuryAddress=getAddress(f.treasuryAddress)
 if(/^0x0{40}$/i.test(treasuryAddress))throw Error('Invalid fee treasury.')
 return {...(f.feeRoutingVersion?{feeRoutingVersion:f.feeRoutingVersion}:{}),quoteId:f.quoteId,treasuryAddress,platformFeeUnits:f.platformFeeUnits,networkFeeUnits:f.networkFeeUnits,treasuryUnits:f.treasuryUnits,totalUnits:f.totalUnits}
}
export function payerCheckoutFeeRows(amount:string,f:PayerCheckoutFeeEvidence){
 const fees=validatePayerCheckoutFees(amount,f),display=(units:string)=>marketplaceFeeAmount(units)+' USDC'
 return [{label:'Order amount',value:display(parseUnits(amount,6).toString())},{label:'Processing fee',value:display(fees.platformFeeUnits)},{label:'Collection network fee',value:display(fees.networkFeeUnits)},{label:'Total paid',value:display(fees.totalUnits)}]
}

import {formatUnits,parseUnits} from 'viem'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.js'
import type {MerchantPaymentFees} from '../src/lib/merchantPaymentFees.js'
const units=(value:unknown,decimals=6)=>{if(typeof value!=='string'||!new RegExp('^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,'+decimals+'})?$').test(value))throw Error('The bank fee could not be verified.');return parseUnits(value,decimals)}
/** Fund the provider's exact returned total from the order budget. Never short-fund an order. */
export async function createMerchantPayoutBudget(grossAmount:string,base:Record<string,unknown>,probe:any,create:(payload:Record<string,unknown>)=>Promise<any>){
 const gross=units(grossAmount)
 // Paycrest's fee accounting uses four decimal places; pin that rounding in the receipt.
 const platform=(gross*25n+500000n)/1000000n*100n
 let network=units(probe.transactionFee)
 const rate=units(probe.rate,18);if(gross<=0n||rate<=0n)throw Error('The bank quote is unavailable.')
 for(let attempt=0;attempt<3;attempt++){
  const principal=gross-platform-network
  if(principal<=0n)throw Error('Order amount cannot cover settlement fees.')
  const {senderFeePercent,...payload}=base
  const data=await create({...payload,amountIn:'crypto',amount:formatUnits(principal,6),rate:probe.rate,senderFee:formatUnits(platform,6),senderFeeAddress:EVM_PLATFORM_TREASURY,transactionFeePayer:'customer',reference:String(base.reference||'').slice(0,76)+'-net'+attempt})
  if(units(data.amount)!==principal||units(data.senderFee)!==platform||units(data.rate,18)!==rate||data.senderFeeAddress&&String(data.senderFeeAddress).toLowerCase()!==EVM_PLATFORM_TREASURY.toLowerCase())throw Error('The bank settlement quote changed. Start checkout again.')
  const actualNetwork=units(data.transactionFee)
  if(actualNetwork!==network){network=actualNetwork;continue}
  // v2's funding instruction is authoritative; arithmetic alone is not proof
  // of the amount the provider expects to receive.
  const account=data.providerAccount??data.provider_account
  if(!account||units(account.amountToTransfer??account.amount_to_transfer)!==gross)throw Error('The provider total does not match the order price.')
  const source=base.source as Record<string,unknown>,destination=base.destination as Record<string,any>
  if(account.currency!==source.currency||data.source?.currency!==source.currency||data.source?.network!==source.network
    ||data.source?.refundAddress!==source.refundAddress||data.destination?.currency!==destination.currency
    ||data.destination?.recipient?.institution!==destination.recipient.institution
    ||data.destination?.recipient?.accountIdentifier!==destination.recipient.accountIdentifier)throw Error('The bank settlement destination changed. Start checkout again.')
  const explicit=data.amountToPay??data.amount_to_pay??data.totalAmount??data.total_amount??data.amountDue??data.amount_due??data.source?.amount??data.sourceAmount??data.source_amount
  if(explicit!==undefined&&units(explicit)!==gross)throw Error('The provider total does not match the order price.')
  const fees:MerchantPaymentFees={payer:'merchant',rounding:'provider-4dp',platformFee:formatUnits(platform,6),networkFee:formatUnits(network,6),netAmount:formatUnits(principal,6)}
  const fiatMinor=(principal*rate+5n*10n**21n)/10n**22n
  return {data,fees,netFiat:formatUnits(fiatMinor,2)}
 }
 throw Error('Network costs changed. Start checkout again for a fresh quote.')
}

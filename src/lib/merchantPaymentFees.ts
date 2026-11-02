import {formatUnits,parseUnits} from 'viem'
export type MerchantPaymentFees={payer:'merchant';rounding?:'provider-4dp';platformFee:string;networkFee:string;netAmount:string}
/** Order amount is the customer's debit. Fee records never change fulfillment value. */
export function validateMerchantPaymentFees(amount:string,fees:MerchantPaymentFees,decimals:number){
 const gross=parseUnits(amount,decimals),platform=parseUnits(fees.platformFee,decimals),network=parseUnits(fees.networkFee,decimals),net=parseUnits(fees.netAmount,decimals)
 const expected=fees.rounding==='provider-4dp'&&decimals===6?(gross*25n+500000n)/1000000n*100n:gross*25n/10000n
 if(fees.payer!=='merchant'||gross<=0n||platform!==expected||network<0n||net<=0n||net+platform+network!==gross)throw Error('Merchant payment fees do not match the order.')
 return {gross,platform,network,net,totalFee:platform+network}
}
export function merchantFeeTotal(fees:MerchantPaymentFees,decimals:number){return formatUnits(parseUnits(fees.platformFee,decimals)+parseUnits(fees.networkFee,decimals),decimals)}

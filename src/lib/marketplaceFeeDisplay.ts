/** Exact display: at least two decimals, no padded trailing zeroes beyond two.
 * Preserve positive sub-cent fees instead of displaying them as zero. */
export function marketplaceFeeAmount(units:string){
 if(!/^(0|[1-9]\d{0,23})$/.test(units))throw Error('Invalid marketplace amount units.')
 const amount=BigInt(units),whole=(amount/1000000n).toString(),fraction=(amount%1000000n).toString().padStart(6,'0').replace(/0+$/,'').padEnd(2,'0')
 return whole+'.'+fraction
}
export type MarketplaceWalletReceiptAmounts={quoteId:string;debitUnits:string;recipientUnits:string;networkFeeUnits:string;feePolicy:'fixed_success_only'}

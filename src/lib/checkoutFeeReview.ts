/** Compare the payer's reviewed terms. Merchant-paid fees are deducted from
 * settlement and may change without changing the amount the payer approves. */
export function checkoutFeeReviewChanged(previous:{totalUnits:string;recipientUnits:string},next:{totalUnits:string;recipientUnits:string},merchantPaidFees:boolean){
 return BigInt(previous.totalUnits)!==BigInt(next.totalUnits)||(!merchantPaidFees&&BigInt(previous.recipientUnits)!==BigInt(next.recipientUnits))
}

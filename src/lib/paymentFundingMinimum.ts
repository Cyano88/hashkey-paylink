// An insufficient-balance response is a funding minimum, never an executable quote.
export function paymentFundingMinimum(error:unknown):bigint|null {
  const e=error as {code?:unknown;feeDetails?:Record<string,unknown>}|null
  if(e?.code!=='INSUFFICIENT_PAYMENT_BALANCE'||!e.feeDetails)return null
  const read=(key:string)=>{const value=e.feeDetails![key];return typeof value==='string'&&/^\d{1,78}$/.test(value)?BigInt(value):null}
  const total=read('totalUnits'),recipient=read('recipientUnits'),network=read('networkFeeUnits'),platform=read('platformFeeUnits'),available=read('availableUnits')
  if(total===null||recipient===null||network===null||platform===null||available===null||recipient<=0n||total<=available||total!==recipient+network+platform)return null
  return total
}

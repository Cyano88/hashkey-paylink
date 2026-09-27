/** Merchant history lists money movements, not abandoned provider quotes. */
export function hasXPayBankFunding(order:{tx_hash?:string;status:string}){
 return /^0x[0-9a-f]{64}$/i.test(order.tx_hash||'')||['settled','refunding','refunded'].includes(order.status.toLowerCase())
}

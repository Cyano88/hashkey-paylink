import type {CheckoutCashPayer} from './checkout-cash.js'
export function assertCashCheckoutPayer(c:{cashPayer?:CheckoutCashPayer},network:string,asset:string,address:string){
 if(c.cashPayer&&(network!=='base'||asset!=='USDC'||address.toLowerCase()!==c.cashPayer.address.toLowerCase()))throw Error('Use the Pocket cash account selected for this checkout.')
}

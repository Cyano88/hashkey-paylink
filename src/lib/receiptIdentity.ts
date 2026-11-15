import {pocketPaymentMethodPaths} from '../pocket/lib/pocketPaymentMethodPaths'
export type ReceiptIconKind='wallet'|'bank_transfer'|'card'|'refund'
export const receiptIconPaths={...pocketPaymentMethodPaths,refund:'M9 10.5H4.5m0 0V6m0 4.5 4.5-4.5a7.5 7.5 0 1 1 0 10.607'}
export function receiptIconKind(r:{source?:string;settlementType?:string;paymentMethod?:string}):ReceiptIconKind{
 const source=(r.source||'').replace(/_/g,'-'),settlement=r.settlementType||''
 if(source==='hosted-checkout'||settlement==='hosted_checkout')return r.paymentMethod==='card'?'card':r.paymentMethod==='bank_transfer'?'bank_transfer':'wallet'
 if(source.includes('refund'))return 'refund'
 if(source==='marketplace-bank'||source.startsWith('bank-')||settlement==='instant_fiat'||settlement==='paycrest_onramp')return 'bank_transfer'
 return 'wallet'
}
/** Decimal strings stay exact. Currency labels are data, never inferred from a symbol. */
export function receiptMoney(amount:string,currency:string){
 if(!/^-?\d+(?:\.\d+)?$/.test(amount))return amount+' '+currency
 const [integer,fraction='']=amount.split('.'),decimals=fraction.replace(/0+$/,'').padEnd(2,'0')
 return integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+decimals+' '+currency
}

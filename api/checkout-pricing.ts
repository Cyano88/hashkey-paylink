import {formatUnits,parseUnits} from 'viem'
import {getPaycrestOfframpRate} from './paycrest-pos.js'
import type {CheckoutPricing} from '../src/lib/checkoutPricing.js'
export type PricingPolicy={accountType?:string;profileCountry?:string;checkoutMode?:string}
export function requiresNgnPricing(p:PricingPolicy){return p.profileCountry==='NG'&&p.accountType==='business'&&p.checkoutMode==='human'}
export function validateCheckoutCurrency(p:PricingPolicy,currency:unknown,amount:unknown,flexible=false){
 if(currency===undefined&&!requiresNgnPricing(p))return undefined
 if(currency==='NGN'&&p.checkoutMode!=='human')throw Object.assign(Error('NGN pricing is available for human checkout only.'),{status:400})
 if(currency!=='NGN')throw Object.assign(Error('Nigerian business checkouts require currency: NGN and amount in naira.'),{status:400})
 if(flexible||typeof amount!=='string'||!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)||parseUnits(amount,2)<=0n)throw Object.assign(Error('Enter a fixed NGN price with at most two decimal places.'),{status:400})
 return formatUnits(parseUnits(amount,2),2)
}
export async function quoteCheckoutPricing(amount:string,asset:string,readRate= getPaycrestOfframpRate,now=Date.now):Promise<CheckoutPricing>{
 if(asset!=='USDC'&&asset!=='USDT')throw Object.assign(Error('NGN-priced checkout supports USDC and USDT only.'),{status:400})
 const kobo=parseUnits(amount,2)
 const convert=(rate:number)=>{if(!Number.isFinite(rate)||rate<=0)throw Error('A fresh NGN quote is unavailable.');const units=parseUnits(rate.toFixed(8),8);if(units<=0n)throw Error('Invalid conversion rate.');return formatUnits((kobo*10n**12n+units-1n)/units,6)}
 // Base is the reference market, not a promise of a Paycrest payout on the payment network.
 const initial=await readRate({network:'base',token:asset,fiat:'NGN',amount:'1'})
 const rate=await readRate({network:'base',token:asset,fiat:'NGN',amount:convert(initial)})
 return {currency:'NGN',amount,paymentAmount:convert(rate),paymentAsset:asset,rate:rate.toFixed(8).replace(/\.?0+$/,''),source:'paycrest',referenceNetwork:'base',quotedAt:new Date(now()).toISOString()}
}

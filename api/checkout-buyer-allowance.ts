import {ALLOWANCE_DAY_POLICY,allowanceDay,currentAllowanceCharge} from '../src/lib/allowanceDay.js'
import {createHash} from 'node:crypto'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {getDurablePaycrestPosOrders,type PaycrestOrderRecord} from './paycrest-pos.js'
import {requirePocketBasicKyc} from './pocket/kyc-level.js'
import {readPocketBankPayoutLimit} from './pocket/spending-limits.js'

import {PURCHASE_DAILY_USD} from '../src/lib/purchaseLimits.js'
export const CHECKOUT_DAILY_USD = PURCHASE_DAILY_USD
export type CheckoutAllowanceOrder=Pick<PaycrestOrderRecord,'source'|'intent_id'|'paycrest_order_id'|'merchant_id'|'receive_address'|'refund_address'|'amount_usdc'|'amount_ngn'|'fiat_currency'> & {allowanceRail?:'wallet';walletNetwork?:string;purchaseBinding?:string}
type Charge={dayPolicy?:string;id:string;provider:string;binding:string;units:number;day:string;state:'reserved'|'refunded'}
export type CheckoutBuyerLedger={charges:Charge[]}
const day=allowanceDay
export const checkoutBuyerLedgerKey=(owner:string)=>'hashpaylink:checkout-buyer-allowance:v1:'+createHash('sha256').update(owner).digest('hex')
export function checkoutPaymentExecutionKey(walletId:string,order:PaycrestOrderRecord){
 const hash=createHash('sha256').update(JSON.stringify(['hosted-checkout-payment:v1',walletId,order.intent_id,order.paycrest_order_id])).digest('hex')
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`
}
const fail=(code:string,message:string,status=403):never=>{throw Object.assign(Error(message),{code,status})}
function units(value:string){
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))return fail('CHECKOUT_LIMIT_UNAVAILABLE','Checkout allowance could not be checked. Please try again.',503)
 const [whole,fraction='']=value.split('.'),n=Number(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0')))
 if(!Number.isSafeInteger(n)||n<=0)return fail('CHECKOUT_LIMIT_UNAVAILABLE','Checkout allowance could not be checked. Please try again.',503)
 return n
}
function capacity(value:number){if(!Number.isFinite(value)||value<=0)return fail('CHECKOUT_LIMIT_UNAVAILABLE','Current checkout capacity is unavailable. Please try again.',503);return units(value.toFixed(6))}
const display=(value:number)=>'USD '+(value/1000000).toLocaleString('en-US',{maximumFractionDigits:6})
export function reserveCheckoutBuyer(ledger:CheckoutBuyerLedger|undefined,input:{order:CheckoutAllowanceOrder;dailyUnits:number;transferUnits:number;now:number}){
 const {order,now,dailyUnits,transferUnits}=input
 if(!['hosted-checkout','ngpos'].includes(order.source||'')||!order.intent_id||!order.paycrest_order_id)return fail('CHECKOUT_LIMIT_BINDING','This payment is not a verified merchant checkout.',409)
 const amount=units(order.amount_usdc),today=day(now)
 const binding=JSON.stringify([order.merchant_id,order.walletNetwork==='solana'?order.receive_address:order.receive_address.toLowerCase(),order.walletNetwork==='solana'?order.refund_address:order.refund_address.toLowerCase(),order.amount_usdc,order.fiat_currency||'NGN',order.amount_ngn,...(order.purchaseBinding?[order.purchaseBinding]:[])])
 const current=ledger||{charges:[]},previous=current.charges.find(c=>c.id===order.intent_id)
 if(previous&&(previous.binding!==binding||previous.provider!==order.paycrest_order_id))return fail('CHECKOUT_LIMIT_BINDING','This payment changed. Start a new checkout.',409)
 if(previous?.state==='refunded')return fail('CHECKOUT_LIMIT_BINDING','This payment was refunded. Start a new checkout.',409)
 // Repeated signing/approval requests must not spend the allowance twice.
 if(previous)return current
 const used=current.charges.filter(c=>currentAllowanceCharge(c,now)&&c.state==='reserved').reduce((sum,c)=>sum+c.units,0)
 if(used+amount>dailyUnits)return fail('CHECKOUT_DAILY_LIMIT',`Your remaining purchase allowance today is ${display(Math.max(0,dailyUnits-used))}. Online and QR purchases share this allowance. It resets at 00:00 UTC.`)
 if(amount>transferUnits)return fail('CHECKOUT_TRANSFER_LIMIT',`This payment exceeds the current payout capacity of ${display(transferUnits)}. Choose another payment method.`)
 const charge:Charge={id:order.intent_id,provider:order.paycrest_order_id,binding,units:amount,day:today,dayPolicy:ALLOWANCE_DAY_POLICY,state:'reserved'}
 return {charges:[...current.charges.filter(c=>c.id!==order.intent_id),charge]}
}

const defaults={kyc:requirePocketBasicKyc,limit:readPocketBankPayoutLimit,read:readDurableJson<CheckoutBuyerLedger>,mutate:mutateDurableJson<CheckoutBuyerLedger>,orders:getDurablePaycrestPosOrders,now:Date.now}
export function createCheckoutBuyerAllowance(deps=defaults){
 return async(owner:string,order:CheckoutAllowanceOrder,checkOnly=true,checkCapacity=true)=>{
  try {await deps.kyc(owner)} catch(error){if((error as {code?:string}).code==='KYC_BASIC_REQUIRED')throw Object.assign(Error('Complete Basic verification for online and QR purchases, with a shared USD 7,000 daily allowance.'),{status:403,code:'KYC_PURCHASE_REQUIRED'});throw error}
  if(!['hosted-checkout','ngpos'].includes(order.source||''))return fail('CHECKOUT_LIMIT_BINDING','This payment is not a verified merchant checkout.',409)
  const currency=order.fiat_currency||'NGN'
  if(currency!=='NGN'&&currency!=='UGX')return fail('CHECKOUT_LIMIT_UNAVAILABLE','This settlement currency is unavailable.',503)
  const dailyUnits=CHECKOUT_DAILY_USD*1_000_000
  let transferUnits=dailyUnits
  // Capacity is checked during bank payment preparation, never for wallet payments.
  // Execution rechecks ownership, expiry and the atomic daily allowance without
  // another provider capacity probe. The bank order already carries its quote.
  if(order.allowanceRail!=='wallet'&&checkOnly&&checkCapacity){
   try {transferUnits=capacity((await deps.limit(currency)).maxUsdc)}
   catch {return fail('CHECKOUT_LIMIT_UNAVAILABLE','Current bank payout capacity is unavailable. Please try again.',503)}
  }
  const key=checkoutBuyerLedgerKey(owner),now=deps.now()
  const ledger=await deps.read(key)
  const candidates=ledger?.charges.filter(c=>currentAllowanceCharge(c,now)&&c.state==='reserved'&&!c.provider.startsWith('wallet:'))||[]
  const orders=candidates.length?await deps.orders(candidates.map(c=>c.id)):[]
  // Only provider-confirmed refunds restore allowance. Unknown failures and
  // cancelled approval dialogs can still settle, so keep their reservations.
  const refunded=candidates.filter(c=>orders.some(o=>o.intent_id===c.id&&o.paycrest_order_id===c.provider&&['hosted-checkout','ngpos'].includes(o.source||'')&&o.status.toLowerCase()==='refunded'))
  const next=(current:CheckoutBuyerLedger|undefined)=>reserveCheckoutBuyer(current?{charges:current.charges.map(c=>refunded.some(r=>r.id===c.id&&r.provider===c.provider&&r.binding===c.binding&&r.day===c.day)?{...c,state:'refunded' as const}:c)}:undefined,{order,dailyUnits,transferUnits,now:deps.now()})
  if(checkOnly){next(ledger);return}
  await deps.mutate(key,next)
 }
}
export const checkCheckoutBuyerAllowance=createCheckoutBuyerAllowance()

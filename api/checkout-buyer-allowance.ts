import {createHash} from 'node:crypto'
import {readDurableJson,mutateDurableJson} from './render-durable-store.js'
import {getDurablePaycrestPosOrders,type PaycrestOrderRecord} from './paycrest-pos.js'
import {requirePocketBasicKyc} from './pocket/kyc-level.js'
import {readPocketBankPayoutLimit} from './pocket/spending-limits.js'

type Charge={id:string;provider:string;binding:string;units:number;day:string;state:'reserved'|'refunded'}
export type CheckoutBuyerLedger={charges:Charge[]}
const day=(now:number)=>new Date(now+3600000).toISOString().slice(0,10)
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
const display=(value:number)=>(value/1000000).toLocaleString('en-US',{maximumFractionDigits:6})+' USDC'
export function reserveCheckoutBuyer(ledger:CheckoutBuyerLedger|undefined,input:{order:PaycrestOrderRecord;dailyUnits:number;transferUnits:number;now:number}){
 const {order,now,dailyUnits,transferUnits}=input
 if(order.source!=='hosted-checkout'||!order.intent_id||!order.paycrest_order_id)return fail('CHECKOUT_LIMIT_BINDING','This payment is not a verified merchant checkout.',409)
 const amount=units(order.amount_usdc),today=day(now)
 const binding=JSON.stringify([order.merchant_id,order.receive_address.toLowerCase(),order.refund_address.toLowerCase(),order.amount_usdc,order.fiat_currency||'NGN',order.amount_ngn])
 const current=ledger||{charges:[]},previous=current.charges.find(c=>c.id===order.intent_id)
 if(previous&&(previous.binding!==binding||previous.provider!==order.paycrest_order_id))return fail('CHECKOUT_LIMIT_BINDING','This payment changed. Start a new checkout.',409)
 if(previous?.state==='refunded')return fail('CHECKOUT_LIMIT_BINDING','This payment was refunded. Start a new checkout.',409)
 // Repeated signing/approval requests must not spend the allowance twice.
 if(previous?.day===today)return current
 if(amount>transferUnits)return fail('CHECKOUT_TRANSFER_LIMIT',`This payment exceeds the current payout capacity of ${display(transferUnits)}. Choose another payment method.`)
 const used=current.charges.filter(c=>c.day===today&&c.state==='reserved').reduce((sum,c)=>sum+c.units,0)
 if(used+amount>dailyUnits)return fail('CHECKOUT_DAILY_LIMIT',`Your remaining checkout allowance today is ${display(Math.max(0,dailyUnits-used))}. It resets at midnight, Lagos time.`)
 const charge:Charge={id:order.intent_id,provider:order.paycrest_order_id,binding,units:amount,day:today,state:'reserved'}
 return {charges:[...current.charges.filter(c=>c.id!==order.intent_id),charge]}
}

const defaults={kyc:requirePocketBasicKyc,limit:readPocketBankPayoutLimit,read:readDurableJson<CheckoutBuyerLedger>,mutate:mutateDurableJson<CheckoutBuyerLedger>,orders:getDurablePaycrestPosOrders,now:Date.now}
export function createCheckoutBuyerAllowance(deps=defaults){
 return async(owner:string,order:PaycrestOrderRecord,checkOnly=true)=>{
  await deps.kyc(owner)
  if(order.source!=='hosted-checkout')return fail('CHECKOUT_LIMIT_BINDING','This payment is not a verified merchant checkout.',409)
  const currency=order.fiat_currency||'NGN'
  if(currency!=='NGN'&&currency!=='UGX')return fail('CHECKOUT_LIMIT_UNAVAILABLE','This settlement currency is unavailable.',503)
  let daily,route
  try {daily=await deps.limit();route=currency==='NGN'?daily:await deps.limit(currency)}
  catch {return fail('CHECKOUT_LIMIT_UNAVAILABLE','Current checkout capacity is unavailable. Please try again.',503)}
  const dailyUnits=capacity(daily.maxUsdc),transferUnits=capacity(route.maxUsdc),key=checkoutBuyerLedgerKey(owner),now=deps.now()
  const ledger=await deps.read(key)
  const candidates=ledger?.charges.filter(c=>c.day===day(now)&&c.state==='reserved')||[]
  const orders=candidates.length?await deps.orders(candidates.map(c=>c.id)):[]
  // Only provider-confirmed refunds restore allowance. Unknown failures and
  // cancelled approval dialogs can still settle, so keep their reservations.
  const refunded=candidates.filter(c=>orders.some(o=>o.intent_id===c.id&&o.paycrest_order_id===c.provider&&o.source==='hosted-checkout'&&o.status.toLowerCase()==='refunded'))
  const next=(current:CheckoutBuyerLedger|undefined)=>reserveCheckoutBuyer(current?{charges:current.charges.map(c=>refunded.some(r=>r.id===c.id&&r.provider===c.provider&&r.binding===c.binding&&r.day===c.day)?{...c,state:'refunded' as const}:c)}:undefined,{order,dailyUnits,transferUnits,now})
  if(checkOnly){next(ledger);return}
  await deps.mutate(key,next)
 }
}
export const checkCheckoutBuyerAllowance=createCheckoutBuyerAllowance()

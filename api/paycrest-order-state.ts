import type { PaycrestOrderRecord } from './paycrest-pos.js'
const progress: Record<string,number> = {initiated:0,created:0,pending:0,processing:0,deposited:1,fulfilling:2,fulfilled:3,settling:4,settled:5,refunding:6,refunded:7}
export function mergePaycrestOrder(current: PaycrestOrderRecord | undefined, incoming: PaycrestOrderRecord): PaycrestOrderRecord {
 if(!current)return incoming
 if(current.intent_id!==incoming.intent_id || current.paycrest_order_id!==incoming.paycrest_order_id)throw new Error('Payout identity mismatch.')
 const old=current.status.toLowerCase(),next=incoming.status.toLowerCase()
 const stale=Date.parse(incoming.updated_at)<Date.parse(current.updated_at)
 const regresses=(progress[old]!==undefined && progress[next]!==undefined && progress[next]<progress[old]) || (['failed','expired','cancelled','canceled'].includes(old) && (progress[next]??99)<1)
 const terminalRegression=(old==='settled' && !['settled','refunding','refunded'].includes(next)) || (old==='refunded' && next!=='refunded')
 const preserve=stale||regresses||terminalRegression
 const merged=preserve?{...incoming,...current}:{...current,...incoming}
 for(const key of ['tx_hash','payer_email','payer_wallet','provider_amount_paid','provider_amount_returned','provider_percent_settled'] as const){
  if(!merged[key])merged[key]=current[key]||incoming[key]
 }
 return merged
}
export function updatePaycrestOrderStore(current: {orders: Record<string,PaycrestOrderRecord>} | undefined, incoming: PaycrestOrderRecord, allowReplacement = false){
 const orders={...(current?.orders||{})}
 const active=orders[incoming.intent_id]
 const existing=orders[incoming.paycrest_order_id] || (active?.paycrest_order_id===incoming.paycrest_order_id ? active : undefined)
 if(active && active.paycrest_order_id!==incoming.paycrest_order_id && !existing && !allowReplacement)throw new Error('Unknown payout replacement.')
 if(allowReplacement && active && active.paycrest_order_id!==incoming.paycrest_order_id && (active.tx_hash || ['deposited','pending','fulfilling','fulfilled','validated','settling','settled','refunding','refunded'].includes(active.status.toLowerCase())))throw new Error('Funded payout cannot be replaced.')
 const saved=mergePaycrestOrder(existing,incoming)
 if(!active || active.paycrest_order_id===saved.paycrest_order_id || allowReplacement)orders[saved.intent_id]=saved
 orders[saved.paycrest_order_id]=saved
 return {orders}
}

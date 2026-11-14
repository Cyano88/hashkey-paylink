type Checkout={id:string;payment?:{status:string;txHash:string};settlement?:{provider:string;intentId:string;orderId:string}}
/** Poll recovery for a funded checkout when a provider webhook is delayed/lost. */
export function createHostedSettlementRefresh(d:{now:()=>number;read:(id:string)=>Promise<{paycrest_order_id:string;source?:string}|null>;refresh:(id:string)=>Promise<unknown>}){
 const last=new Map<string,number>(),active=new Set<string>()
 return async(record:Checkout)=>{
  const s=record.settlement,now=d.now()
  if(!s||s.provider!=='paycrest'||record.payment?.status!=='processing'||!/^0x[a-fA-F0-9]{64}$/.test(record.payment.txHash))return
  if(active.has(record.id)||now-(last.get(record.id)??-Infinity)<10000)return
  for(const [id,at] of last)if(now-at>60000)last.delete(id)
  if(last.size>=1000)return
  last.set(record.id,now);active.add(record.id)
  try{
   const order=await d.read(s.intentId)
   if(order?.source!=='hosted-checkout'||order.paycrest_order_id!==s.orderId)return
   await d.refresh(s.intentId)
  }catch{/* Preserve processing during provider outages; never infer failure or retry funding. */}
  finally{active.delete(record.id)}
 }
}

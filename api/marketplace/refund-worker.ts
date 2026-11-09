import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {createMarketplaceRefundExecution} from './refund-execution.js'
import type {createMarketplaceWebhooks} from './webhooks.js'

type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;execution?:ReturnType<typeof createMarketplaceRefundExecution>;webhooks:ReturnType<typeof createMarketplaceWebhooks>}
/** Internal bounded drain. Runtime must explicitly supply execution config and schedule this worker. */
export function createMarketplaceRefundWorker(d:Dependencies){
 return {async drain(projectId:string,limit=10){
  marketplaceReference(projectId)
  if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Use a refund worker batch size between 1 and 20.')
  if(!d.execution)throw Error('Marketplace refund worker is not configured.')
  const state=await d.read()
  const tasks=(state?.books||[]).filter(b=>b.plan.projectId===projectId).flatMap(b=>(b.refundReservations||[]).filter(r=>!['settled','failed'].includes(b.refundExecutions?.find(e=>e.refundId===r.refundId)?.state||'')).map(r=>({paymentId:b.plan.paymentId,refundId:r.refundId,key:JSON.stringify([b.plan.paymentId,r.refundId])}))).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
  const cursor=state?.refundWorkerCursors?.[projectId]||''
  const ordered=[...tasks.filter(t=>t.key>cursor),...tasks.filter(t=>t.key<=cursor)].slice(0,limit)
  const results:Array<{paymentId:string;refundId:string;status:string}>=[]
  for(const task of ordered){
   // Advance before I/O: a crashing or blocked item cannot starve later work after restart.
   await d.mutate(s=>{s.refundWorkerCursors={...(s.refundWorkerCursors||{}),[projectId]:task.key};return s})
   let status='deferred'
   try{
    let execution=await d.execution.submit(projectId,task.paymentId,task.refundId)
    if(!execution.transactionId)execution=await d.execution.recover(projectId,task.paymentId,task.refundId)
    if(execution.transactionId)execution=await d.execution.reconcile(projectId,task.paymentId,task.refundId)
    status=execution.state
   }catch{/* Leave uncertain funds reserved. Never return provider errors or secrets. */}
   results.push({paymentId:task.paymentId,refundId:task.refundId,status})
  }
  let delivered=0
  for(const event of await d.webhooks.pending(projectId,limit)){
   try{const result=await d.webhooks.deliver(projectId,event.paymentId,event.eventId);if(result.status==='delivered')delivered++}catch{/* Existing outbox retry policy retains the event. */}
  }
  return {results,delivered}
 }}
}

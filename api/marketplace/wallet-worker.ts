import {marketplaceReference} from './beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
import type {createMarketplaceWalletCustody} from './wallet-custody.js'
import type {createMarketplaceWebhooks} from './webhooks.js'

type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;execution?:ReturnType<typeof createMarketplaceWalletCustody>;webhooks:ReturnType<typeof createMarketplaceWebhooks>}
/** Internal bounded drain. Runtime must explicitly supply execution config and schedule this worker. */
export function createMarketplaceWalletWorker(d:Dependencies){
 return {async drain(projectId:string,limit=10){
  marketplaceReference(projectId)
  if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Use a wallet worker batch size between 1 and 20.')
  if(!d.execution)throw Error('Marketplace wallet worker is not configured.')
  const state=await d.read()
  const tasks=(state?.books||[]).filter(b=>b.plan.projectId===projectId).flatMap(b=>(b.walletReservations||[]).filter(r=>b.operations.some(o=>o.id===r.operationId&&['reserved','unknown'].includes(o.status))&&!['settled','failed'].includes(b.walletExecutions?.filter(e=>e.operationId===r.operationId).at(-1)?.state||'')).map(r=>({paymentId:b.plan.paymentId,operationId:r.operationId,key:JSON.stringify([b.plan.paymentId,r.operationId])}))).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
  const cursor=state?.walletWorkerCursors?.[projectId]||''
  const ordered=[...tasks.filter(t=>t.key>cursor),...tasks.filter(t=>t.key<=cursor)].slice(0,limit)
  const results:Array<{paymentId:string;operationId:string;status:string}>=[]
  for(const task of ordered){
   // Advance before I/O: a crashing or blocked item cannot starve later work after restart.
   await d.mutate(s=>{s.walletWorkerCursors={...(s.walletWorkerCursors||{}),[projectId]:task.key};return s})
   let status='deferred'
   try{
    const execution=await d.execution.submit(projectId,task.paymentId,task.operationId,'marketplace_wallet_worker')
    if(execution?.circleTransfer?.transactionId&&execution.transactionHash){
     status=(await d.execution.reconcile(projectId,task.paymentId,task.operationId)).status
    }else status=execution?.state??'deferred'
   }catch{/* Leave uncertain funds reserved. Never return provider errors or secrets. */}
   results.push({paymentId:task.paymentId,operationId:task.operationId,status})
  }
  let delivered=0
  for(const event of await d.webhooks.pending(projectId,limit)){
   try{const result=await d.webhooks.deliver(projectId,event.paymentId,event.eventId);if(result.status==='delivered')delivered++}catch{/* Existing outbox retry policy retains the event. */}
  }
  return {results,delivered}
 }}
}

import {readDurableJson,hasRenderDurableStore} from '../render-durable-store.js'
import {crossBridgeJournalKey} from './cross-bridge-reservation.js'
import type {CrossBridgeJournal} from './cross-bridge-reservation-guard.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {crossBridgeRuntime,reconcileCrossBridge} from './cross-bridge-runtime.js'

const defaults={durable:hasRenderDurableStore,list:async()=>Object.values((await readDurableJson<CrossBridgeJournal>(crossBridgeJournalKey()))?.crossBridge??{}),open:openCrossBridgeReview,runtime:crossBridgeRuntime,reconcile:reconcileCrossBridge}
/** Recovery is independent of rollout flags. It never creates an approval or a new transaction. */
export function createCrossBridgeWorker(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides};let running:Promise<void>|undefined
 async function run(){
  if(!d.durable())return
  const rows=(await d.list()).filter(o=>['submitting','pending','submitted','source_confirmed'].includes(o.state)||['completed','refunded'].includes(o.state)&&!o.ledgerPublishedAt).sort((a,b)=>Number(a.updatedAt)-Number(b.updatedAt))
  for(const row of rows.slice(0,50)){
   try{
    let op=row
    if(typeof op.quoteToken!=='string')continue
    const r=await d.open(op.quoteToken,op.ownerId,{recovery:true})
    if(r.quote.input.source==='solana'){
     const runtime=d.runtime(r,'')
     if('broadcast' in runtime&&typeof runtime.broadcast==='function')op=await runtime.broadcast(op.id)
    }else if(!op.sourceHash&&r.quote.wallets.source.provider==='privy')op=await d.runtime(r,'').status(op.id)
    if(op.sourceHash)await d.reconcile(op.ownerId,op.id)
   }catch{/* A missing proof remains pending and must not stop other recoveries. */}
  }
 }
 return ()=>running??(running=run().finally(()=>{running=undefined}))
}
export const drainCrossBridges=createCrossBridgeWorker()

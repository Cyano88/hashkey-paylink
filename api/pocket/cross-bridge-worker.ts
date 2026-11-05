import {recoverCrossBridgeCircleHash} from './cross-bridge-circle-recovery.js'
import {readDurableJson,hasRenderDurableStore} from '../render-durable-store.js'
import {crossBridgeJournalKey} from './cross-bridge-reservation.js'
import type {CrossBridgeJournal} from './cross-bridge-reservation-guard.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {crossBridgeRuntime,reconcileCrossBridge} from './cross-bridge-runtime.js'

const defaults={recoverCircle:recoverCrossBridgeCircleHash,durable:hasRenderDurableStore,list:async()=>Object.values((await readDurableJson<CrossBridgeJournal>(crossBridgeJournalKey()))?.crossBridge??{}),open:openCrossBridgeReview,runtime:crossBridgeRuntime,reconcile:reconcileCrossBridge}
/** Recovery is independent of rollout flags. It never creates an approval or a new transaction. */
export function createCrossBridgeWorker(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides};let running:Promise<void>|undefined,cursor=0
 async function run(){
  if(!d.durable())return
  const rows=(await d.list()).filter(o=>['submitting','pending','submitted','source_confirmed'].includes(o.state)||['completed','refunded'].includes(o.state)&&!o.ledgerPublishedAt).sort((a,b)=>Number(a.updatedAt)-Number(b.updatedAt))
  const batch=Array.from({length:Math.min(rows.length,50)},(_,i)=>rows[(cursor+i)%rows.length])
  cursor=rows.length?(cursor+batch.length)%rows.length:0
  const recover=async(row:(typeof batch)[number])=>{
   try{
    let op=row
    if(typeof op.quoteToken!=='string')return
    const r=await d.open(op.quoteToken,op.ownerId,{recovery:true})
    if(r.quote.input.source==='solana'){
     const runtime=d.runtime(r,'')
     if('broadcast' in runtime&&typeof runtime.broadcast==='function')op=await runtime.broadcast(op.id)
    }else if(!op.sourceHash&&r.quote.wallets.source.provider==='privy')op=await d.runtime(r,'').status(op.id)
    if(!op.sourceHash&&r.quote.wallets.source.provider==='circle'&&r.quote.input.source!=='solana')op=await d.recoverCircle(op,r)
    if(op.sourceHash)await d.reconcile(op.ownerId,op.id)
   }catch{/* A missing proof remains pending and must not stop other recoveries. */}
  }
  await Promise.all(Array.from({length:Math.min(3,batch.length)},async()=>{while(batch.length){const row=batch.shift();if(row)await recover(row)}}))
 }
 return ()=>running??(running=run().finally(()=>{running=undefined}))
}
export const drainCrossBridges=createCrossBridgeWorker()

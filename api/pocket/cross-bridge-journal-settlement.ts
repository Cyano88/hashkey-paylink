import {createHash} from 'node:crypto'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {crossBridgeReservationStore,type CrossBridgeReservation} from './cross-bridge-reservation.js'
import {createCrossBridgeSettlement,type CrossBridgeSettlementRecord,type CrossBridgeSettlementDependencies} from './cross-bridge-settlement.js'

type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
type Store=Pick<typeof crossBridgeReservationStore,'read'|'mutate'>
export type CrossBridgeJournalSettlementDependencies=Omit<CrossBridgeSettlementDependencies,'read'|'mutate'|'source'>&{
 store?:Store;
 open?(token:string,owner:string):Promise<Review>;
 // The source adapter receives the reconstructed approved fee-inclusive plan.
 source(record:CrossBridgeSettlementRecord,review:Review):Promise<'pending'|'confirmed'|'failed'>;
}
function fail():never{throw Object.assign(Error('Saved bridge settlement changed or is unavailable.'),{status:409})}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
const identity=(r:CrossBridgeSettlementRecord)=>JSON.stringify([r.id,r.ownerId,r.sourceHash,r.plan],(_,v)=>typeof v==='bigint'?v.toString():v)
const states=['submitted','source_confirmed','source_failed','completed','refunded']
/** Settlement is a view over the existing operation, never another store.
 * Reconstructed calls/instructions remain in memory; only verified primitive
 * settlement fields are merged back under the same reservation locks. */
export function createCrossBridgeJournalSettlement(d:CrossBridgeJournalSettlementDependencies){
 const store=d.store??crossBridgeReservationStore
 const open=d.open??((token,owner)=>openCrossBridgeReview(token,owner,{recovery:true,now:d.now()}))
 return async(owner:string,id:string)=>{
  const first=await store.read(id)
  if(!first||first.ownerId!==owner||first.id!==id||typeof first.quoteToken!=='string'||first.fingerprint!==hash(first.quoteToken))fail()
  const token=first.quoteToken as string,review=await open(token,owner),q=review.quote
  if(q.id!==id||q.ownerId!==owner||first.source!==q.input.source||first.walletAddress!==q.wallets.source.address||first.expiresAt!==q.expiresAt)fail()
  if(!states.includes(first.state)||!first.sourceHash)return first
  function view(op:CrossBridgeReservation|undefined):CrossBridgeSettlementRecord{
   if(!op||op.id!==id||op.ownerId!==owner||op.quoteToken!==token||op.fingerprint!==hash(token)||op.sourceHash!==first!.sourceHash||op.source!==first!.source||op.walletAddress!==first!.walletAddress||op.expiresAt!==q.expiresAt||!states.includes(op.state)||!Number.isSafeInteger(op.updatedAt))fail()
   return {id,ownerId:owner,sourceHash:op.sourceHash!,state:op.state as CrossBridgeSettlementRecord['state'],updatedAt:op.updatedAt as number,plan:{route:review.route,sender:q.input.sender,recipient:q.input.recipient},...(op.settlement?{settlement:op.settlement as CrossBridgeSettlementRecord['settlement']}:{})}
  }
  const reconcile=createCrossBridgeSettlement({
   now:d.now,provider:d.provider,received:d.received,ledger:d.ledger,
   source:r=>d.source(r,review),
   read:async()=>view(await store.read(id)),
   mutate:async(_,update)=>{
    const result=await store.mutate(id,op=>{
     const current=view(op),next=update(current)
     if(identity(next)!==identity(current)||!states.includes(next.state)||!Number.isSafeInteger(next.updatedAt))fail()
     return {...op!,state:next.state,updatedAt:next.updatedAt,...(next.settlement?{settlement:JSON.parse(JSON.stringify(next.settlement))}:{})}
    })
    return view(result)
   },
  })
  await reconcile(owner,id)
  const result=await store.read(id);view(result);return result!
 }
}

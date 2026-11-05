import {readCrossBridgeDelivery,observeCrossBridgeDelivery} from './cross-bridge-delivery.js'
import {createHash} from 'node:crypto'
import {formatUnits} from 'viem'
import {crossBridgeDeliveryCandidate,crossBridgeDeliveryProven,crossBridgeHash,type CrossBridgeSettlementPlan,type CrossBridgeDeliveryCandidate} from './cross-bridge-evidence.js'
import type {PocketMoneyLedgerInput} from './money-ledger.js'
export type CrossBridgeSettlementRecord={id:string;ownerId:string;plan:CrossBridgeSettlementPlan;sourceHash:string;state:'submitted'|'source_confirmed'|'source_failed'|'completed'|'refunded';updatedAt:number;observedDelivery?:CrossBridgeDeliveryCandidate&{amountUnits:string;observedAt:number}|null;delivery?:CrossBridgeDeliveryCandidate&{amountUnits:string;verifiedAt:number};settlement?:CrossBridgeDeliveryCandidate&{amountUnits:string;verifiedAt:number}}
export type CrossBridgeSettlementDependencies={
 read(id:string):Promise<CrossBridgeSettlementRecord|undefined>;
 // Must share the transactional operation/reservation store, not a second copy.
 mutate(id:string,fn:(r:CrossBridgeSettlementRecord|undefined)=>CrossBridgeSettlementRecord):Promise<CrossBridgeSettlementRecord>;
 // Must verify exact saved execution, source asset/fees, chain and finality.
 // Intentionally no provider-status or permissive production default.
 source(r:CrossBridgeSettlementRecord):Promise<'pending'|'confirmed'|'failed'>;
 provider(r:CrossBridgeSettlementRecord):Promise<{status:unknown;requests:unknown}>;
 received?(c:CrossBridgeDeliveryCandidate):Promise<bigint|null>;
 observed?(c:CrossBridgeDeliveryCandidate):Promise<bigint|null>;
 ledger(event:PocketMoneyLedgerInput):Promise<unknown>;now():number;
}
const terminal=(s:string)=>['source_failed','completed','refunded'].includes(s)
const fail=():never=>{throw Object.assign(Error('Bridge recovery state changed or is unavailable.'),{status:409})}
const fingerprint=(r:CrossBridgeSettlementRecord)=>createHash('sha256').update(JSON.stringify([r.ownerId,r.id,r.sourceHash,r.plan],(_,v)=>typeof v==='bigint'?v.toString():v)).digest('hex')
/** Internal only. No public route/dispatch is mounted by this coordinator.
 * A chain-proof dependency failure leaves the existing reservation untouched. */
export function createCrossBridgeSettlement(d:CrossBridgeSettlementDependencies){
 const owned=(r:CrossBridgeSettlementRecord|undefined,owner:string,id:string)=>{if(!r||r.ownerId!==owner||r.id!==id||!crossBridgeHash(r.plan.route.source,r.sourceHash))return fail();return r}
 async function publish(r:CrossBridgeSettlementRecord){
  const q=r.plan.route,s=r.settlement
  if(r.state==='source_failed')return r
  if(!s||r.state!==s.outcome||!crossBridgeDeliveryProven(s,BigInt(s.amountUnits)))return fail()
  await d.ledger({eventKey:'cross-bridge:'+r.id+':'+r.state,ownerId:r.ownerId,executionId:r.id,rail:'wallet_bridge',state:r.state,asset:s.token.symbol,amount:formatUnits(BigInt(s.amountUnits),s.token.decimals),sourceNetwork:q.source,settlementNetwork:s.network,resourceId:r.id,providerReference:q.requestId,transactionHash:r.sourceHash,recordedAt:s.verifiedAt,metadata:{provider:'relay',destinationTxHash:s.hash,orderId:q.orderId,sourceAsset:q.tokenIn.symbol,sourceAmountUnits:q.amountUnits,settledAmountUnits:s.amountUnits}})
  return r
 }
 return async function reconcile(owner:string,id:string){
  const r=structuredClone(owned(await d.read(id),owner,id)),identity=fingerprint(r)
  if(terminal(r.state))return publish(r)
  // Delivery and source finality are independent. A source reader outage must
  // never promote settlement, but need not hide independently proven delivery.
  const sourceRead=d.source(structuredClone(r)).catch(()=>'pending' as const)
  // Independent chain/provider reads run together; source finality latency
  // must not be added to destination receipt latency. Both results are still
  // required before terminal settlement, and source failure takes precedence.
  const deliveryRead=(async()=>{
   const provider=await d.provider(structuredClone(r))
   const candidate=crossBridgeDeliveryCandidate(r.plan,r.sourceHash,provider.status,provider.requests)
   if(!candidate)return null
   let received:bigint|null=null,observed:bigint|null=null
   try{received=await (d.received??readCrossBridgeDelivery)(structuredClone(candidate))}catch{/* Observation may still explain progress. */}
   if(!crossBridgeDeliveryProven(candidate,received)){
    try{observed=await (d.observed??observeCrossBridgeDelivery)(structuredClone(candidate))}catch{/* No claim without chain evidence. */}
   }
   return {candidate,received,observed}
  })()
  const [sourceResult,deliveryResult]=await Promise.allSettled([sourceRead,deliveryRead])
  const source=sourceResult.status==='fulfilled'?sourceResult.value:'pending'
  if(!['pending','confirmed','failed'].includes(source))return fail()
  const advance=async(update:(current:CrossBridgeSettlementRecord)=>CrossBridgeSettlementRecord)=>d.mutate(id,current=>{
   const row=owned(current,owner,id)
   if(fingerprint(row)!==identity)return fail()
   if(terminal(row.state))return row
   return update(row)
  })
  if(source==='failed')return publish(await advance(row=>({...row,state:'source_failed',updatedAt:d.now()})))
  const saved=source==='confirmed'?await advance(row=>({...row,state:'source_confirmed',updatedAt:d.now()})):r
  if(terminal(saved.state))return publish(saved)
  if(deliveryResult.status==='rejected')throw deliveryResult.reason
  if(!deliveryResult.value)return r.observedDelivery?advance(row=>({...row,observedDelivery:null,updatedAt:d.now()})):saved
  const {candidate,received,observed}=deliveryResult.value
  if(!crossBridgeDeliveryProven(candidate,received)){
   const observation=candidate.outcome==='completed'&&crossBridgeDeliveryProven(candidate,observed)?{...candidate,amountUnits:String(observed),observedAt:d.now()}:null
   if(observation||r.observedDelivery)return advance(row=>({...row,observedDelivery:observation,updatedAt:d.now()}))
   return saved
  }
  const verifiedAt=d.now()
  if(source!=='confirmed'){
   // Presentation evidence only: no terminal state, released reservation, or ledger.
   if(candidate.outcome!=='completed')return saved
   return advance(row=>({...row,delivery:{...candidate,amountUnits:String(received),verifiedAt},updatedAt:verifiedAt}))
  }
  return publish(await advance(row=>({...row,state:candidate.outcome,settlement:{...candidate,amountUnits:String(received),verifiedAt},updatedAt:verifiedAt})))
 }
}

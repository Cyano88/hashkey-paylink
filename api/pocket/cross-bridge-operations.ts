import {createHash} from 'node:crypto'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {crossBridgeReservationStore,type CrossBridgeReservation} from './cross-bridge-reservation.js'
import {crossBridgeReservationTerminal} from './cross-bridge-reservation-guard.js'
import {crossBridgeHash} from './cross-bridge-evidence.js'

type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
export type CrossBridgeOperation=CrossBridgeReservation&{quoteToken:string;createdAt:number;updatedAt:number}
export type CrossBridgeObservation={sourceHash?:string;challengeId?:string;transactionId?:string;userOperationHash?:string;definitelyNotSubmitted?:boolean}
type Store=Pick<typeof crossBridgeReservationStore,'read'|'mutate'>
export type CrossBridgeOperationDependencies={
 store?:Store;now():number;
 open(token:string,owner:string,recovery:boolean):Promise<Review>;
 approve(owner:string,approval:string):Promise<boolean>;
 // Revalidates wallet ownership, approved fee coverage/balance and exact execution.
 preflight(review:Review):Promise<void>;
 // Must use operation.id as provider idempotency key. Authorization stays in memory.
 dispatch(review:Review,operation:CrossBridgeOperation,authorization:string):Promise<CrossBridgeObservation|null>;
 // Read-only provider lookup. An unknown result must never create another send.
 observe(review:Review,operation:CrossBridgeOperation):Promise<CrossBridgeObservation|null>;
}
const fail=(message='This saved bridge changed. Review it again.'):never=>{throw Object.assign(Error(message),{status:409})}
const hash=(token:string)=>createHash('sha256').update(token).digest('hex')
const hasReference=(r:CrossBridgeObservation)=>!!(r.sourceHash||r.challengeId||r.transactionId||r.userOperationHash)
/** Shares the existing reservation journal. Every provider call happens AFTER
 * the atomic submitting reservation; status/recovery never invokes dispatch. */
export function createCrossBridgeOperations(d:CrossBridgeOperationDependencies){
 const store=d.store??crossBridgeReservationStore
 function owned(r:CrossBridgeReservation|undefined,owner:string,id:string):CrossBridgeOperation{
  if(!r||r.id!==id||r.ownerId!==owner||typeof r.quoteToken!=='string'||r.fingerprint!==hash(r.quoteToken))fail()
  return structuredClone(r) as CrossBridgeOperation
 }
 const read=async(owner:string,id:string)=>owned(await store.read(id),owner,id)
 async function apply(owner:string,id:string,fingerprint:string,result:CrossBridgeObservation|null){
  if(!result)return read(owner,id)
  if(typeof result!=='object'||Array.isArray(result)||result.definitelyNotSubmitted!==undefined&&typeof result.definitelyNotSubmitted!=='boolean')fail()
  for(const field of ['challengeId','transactionId'] as const)if(result[field]!==undefined&&(typeof result[field]!=='string'||!result[field]!.trim()||result[field]!.length>256))fail('Provider returned an invalid bridge reference.')
  if(result.userOperationHash!==undefined&&!/^0x[0-9a-f]{64}$/i.test(result.userOperationHash))fail()
  return owned(await store.mutate(id,raw=>{
   const r=owned(raw,owner,id);if(r.fingerprint!==fingerprint)fail()
   if(crossBridgeReservationTerminal(r.state))return r
   if(!['submitting','pending','submitted','source_confirmed'].includes(r.state))fail()
   if(result.sourceHash!==undefined&&!crossBridgeHash(r.source as Review['route']['source'],result.sourceHash))fail()
   if(result.definitelyNotSubmitted){
    if(hasReference(result)||hasReference(r)||r.state!=='submitting')fail('Bridge submission is still being verified.')
    return {...r,state:'not_submitted',updatedAt:d.now()}
   }
   const refs:CrossBridgeObservation={}
   for(const key of ['sourceHash','challengeId','transactionId','userOperationHash'] as const){
    if(result[key]===undefined)continue
    if(r[key]&&r[key]!==result[key])fail('Bridge provider reference changed.')
    refs[key]=result[key]
   }
   if(!hasReference(refs))return r
   return {...r,...refs,state:r.state==='source_confirmed'?'source_confirmed':r.sourceHash||refs.sourceHash?'submitted':'pending',updatedAt:d.now()}
  }),owner,id)
 }
 return {
  read,
  async prepare(token:string,owner:string,approval:string){
   const reviewed=await d.open(token,owner,true),q=reviewed.quote,previous=await store.read(q.id),fingerprint=hash(token)
   if(previous){const r=owned(previous,owner,q.id);if(r.fingerprint!==fingerprint)fail();return r}
   const fresh=await d.open(token,owner,false)
   if(!await d.approve(owner,approval))fail('Confirm this bridge with your PIN or fingerprint.')
   await d.preflight(fresh)
   return owned(await store.mutate(q.id,current=>{
    if(current){const r=owned(current,owner,q.id);if(r.fingerprint!==fingerprint)fail();return r}
    if(q.expiresAt<=d.now())fail('Bridge quote expired. Review it again.')
    return {id:q.id,ownerId:owner,source:q.input.source,walletAddress:q.wallets.source.address,fingerprint,quoteToken:token,expiresAt:q.expiresAt,state:'prepared',createdAt:d.now(),updatedAt:d.now()}
   }),owner,q.id)
  },
  async cancel(owner:string,id:string){return owned(await store.mutate(id,current=>{
   const r=owned(current,owner,id)
   return r.state==='prepared'&&!hasReference(r)?{...r,state:'cancelled',updatedAt:d.now()}:r
  }),owner,id)},
  async submit(owner:string,id:string,authorization:string){
   const op=await read(owner,id);if(op.state!=='prepared')return op
   if(typeof authorization!=='string'||!authorization||authorization.length>16000)fail('Unlock your source wallet.')
   const reviewed=await d.open(op.quoteToken,owner,false);await d.preflight(reviewed)
   let reserved=false
   const latest=owned(await store.mutate(id,current=>{
    const r=owned(current,owner,id);if(r.fingerprint!==op.fingerprint)fail()
    if(r.state!=='prepared')return r
    if(r.expiresAt<=d.now())fail('Bridge quote expired. Review it again.')
    reserved=true;return {...r,state:'submitting',updatedAt:d.now()}
   }),owner,id)
   if(!reserved)return latest
   let result:CrossBridgeObservation|null=null
   try{result=await d.dispatch(reviewed,structuredClone(latest),authorization)}catch{/* Unknown outcome stays reserved. Never retry dispatch here. */}
   return apply(owner,id,op.fingerprint,result)
  },
  async status(owner:string,id:string){
   const op=await read(owner,id)
   if(op.state==='prepared'||crossBridgeReservationTerminal(op.state))return op
   const reviewed=await d.open(op.quoteToken,owner,true)
   let result:CrossBridgeObservation|null=null
   try{result=await d.observe(reviewed,structuredClone(op))}catch{/* Connectivity is not a failed payment. */}
   return apply(owner,id,op.fingerprint,result)
  },
 }
}

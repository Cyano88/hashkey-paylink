import {createHash} from 'node:crypto'
import {openCircleKitReview,type CircleKitReview} from './circle-bridge-review.js'
export type CircleKitOperation={id:string;ownerId:string;quoteToken:string;quote:CircleKitReview;fingerprint:string;state:'prepared'|'submitting'|'pending'|'cancelled'|'not_submitted';createdAt:number;updatedAt:number;challengeId?:string;txHash?:string}
export type CircleKitOperationStore={operations:Record<string,CircleKitOperation>}
type Dependencies={now():number;open(token:string,owner:string,recovery:boolean):ReturnType<typeof openCircleKitReview>;read():Promise<CircleKitOperationStore|undefined>;mutate(fn:(store:CircleKitOperationStore|undefined)=>CircleKitOperationStore):Promise<unknown>;approve(owner:string,approval:string):Promise<boolean>;preflight(q:CircleKitReview):Promise<void>;dispatch(q:CircleKitReview,userToken:string):Promise<{challengeId:string}>;recover(op:CircleKitOperation,userToken:string):Promise<{challengeId?:string;txHash?:string;notSubmitted?:boolean}|null>}
const fail=(message='This bridge must be reviewed again.'):never=>{throw Object.assign(Error(message),{status:409})}
const terminal=(s:CircleKitOperation['state'])=>s==='cancelled'||s==='not_submitted'
/** Internal, authenticated service. mutate MUST be durable and transactional.
 * Provider dispatch is reserved before calling Circle. Recovery never dispatches.
 * Settlement promotion belongs to the independent chain-proof worker, not here. */
export function createCircleKitOperations(d:Dependencies){
 const bound=(op:CircleKitOperation|undefined,owner:string)=>{if(!op||op.ownerId!==owner)fail();return op!}
 const read=async(id:string,owner:string)=>structuredClone(bound((await d.read())?.operations[id],owner))
 async function prepare(token:string,owner:string,approval:string){
  const {quote}=await d.open(token,owner,false),fingerprint=createHash('sha256').update(token).digest('hex')
  const previous=(await d.read())?.operations[quote.id]
  if(previous){bound(previous,owner);if(previous.fingerprint!==fingerprint)fail();return structuredClone(previous)}
  await d.preflight(quote)
  if(!await d.approve(owner,approval))fail('Confirm this bridge with your PIN or fingerprint.')
  await d.mutate(current=>{
   const store=current||{operations:{}},existing=store.operations[quote.id]
   if(existing){bound(existing,owner);if(existing.fingerprint!==fingerprint)fail();return store}
   if(quote.expiresAt<=d.now())fail()
   for(const op of Object.values(store.operations)){
    if(op.ownerId!==owner||op.quote.wallets.source.network!==quote.wallets.source.network||op.quote.wallets.source.address.toLowerCase()!==quote.wallets.source.address.toLowerCase()||terminal(op.state))continue
    if(op.state==='prepared'&&op.quote.expiresAt<=d.now()){op.state='cancelled';op.updatedAt=d.now();continue}
    fail('Your previous bridge is still being confirmed.')
   }
   store.operations[quote.id]={id:quote.id,ownerId:owner,quoteToken:token,quote,fingerprint,state:'prepared',createdAt:d.now(),updatedAt:d.now()};return store
  });return read(quote.id,owner)
 }
 async function cancel(id:string,owner:string){await d.mutate(store=>{const op=bound(store?.operations[id],owner);if(op.state==='prepared'){op.state='cancelled';op.updatedAt=d.now()}return store!});return read(id,owner)}
 async function submit(id:string,owner:string,userToken:string){
  const op=await read(id,owner);if(op.state!=='prepared')return op
  if(typeof userToken!=='string'||!userToken||userToken.length>8000)fail('Unlock your source wallet.')
  await d.open(op.quoteToken,owner,false);await d.preflight(op.quote)
  let reserved=false
  await d.mutate(store=>{const current=bound(store?.operations[id],owner);if(current.fingerprint!==op.fingerprint)fail();if(current.state==='prepared'){if(current.quote.expiresAt<=d.now())fail();current.state='submitting';current.updatedAt=d.now();reserved=true}return store!})
  if(!reserved)return read(id,owner)
  let response:{challengeId:string}|undefined
  try{response=await d.dispatch(op.quote,userToken)}catch{/* Unknown outcome remains reserved, including process/network failures. */}
  if(response?.challengeId&&typeof response.challengeId==='string'&&response.challengeId.length<=256)await d.mutate(store=>{const current=bound(store?.operations[id],owner);if(!terminal(current.state)){if(current.challengeId&&current.challengeId!==response!.challengeId)fail();current.challengeId=response!.challengeId;current.state='pending';current.updatedAt=d.now()}return store!})
  return read(id,owner)
 }
 async function resume(id:string,owner:string,userToken:string){
  const op=await read(id,owner);if(op.state==='prepared'||terminal(op.state))return op
  if(typeof userToken!=='string'||!userToken||userToken.length>8000)fail('Unlock your source wallet.')
  await d.open(op.quoteToken,owner,true)
  const result=await d.recover(op,userToken);if(!result)return op
  if(result.txHash&&!/^0x[0-9a-f]{64}$/i.test(result.txHash))fail()
  if(result.challengeId&&(typeof result.challengeId!=='string'||result.challengeId.length>256))fail()
  await d.mutate(store=>{const current=bound(store?.operations[id],owner);if(terminal(current.state))return store!;if(current.txHash&&result.txHash&&current.txHash.toLowerCase()!==result.txHash.toLowerCase())fail();if(current.challengeId&&result.challengeId&&current.challengeId!==result.challengeId)fail();if(result.txHash)current.txHash=result.txHash;if(result.challengeId)current.challengeId=result.challengeId;current.state=result.notSubmitted&&!current.txHash?'not_submitted':'pending';current.updatedAt=d.now();return store!});return read(id,owner)
 }
 return {prepare,submit,cancel,resume,read}
}

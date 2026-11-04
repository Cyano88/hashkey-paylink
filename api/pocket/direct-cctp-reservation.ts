import {createHash} from 'node:crypto'
import type {Hex} from 'viem'
import {claimCirclePocketAction,findCirclePocketAction,recordCirclePocketAction,listCirclePocketActions,type CirclePocketActionRecord} from '../circle-pocket-action-journal.js'
import {formatUnits} from 'viem'
import {hasRenderDurableStore} from '../render-durable-store.js'
import type {EvmBridgeFeeQuote} from './evm-bridge-reimbursement.js'
import {readDirectCctpSource} from './direct-cctp-source-proof.js'
import {readCircleKitTransaction} from './circle-bridge-transaction.js'

export const DIRECT_CCTP_ACTION='reservation.direct-cctp'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fail=(message:string,status=409):never=>{throw Object.assign(Error(message),{status})}
const terminal=(status:string)=>['completed','failed','cancelled','not_submitted'].includes(status)
type Binding={ownerId:string;source:string;walletId:string;walletAddress:string;id:string}
type Source='base'|'arbitrum'|'ethereum'|'polygon'|'arc'
const key=(b:Binding)=>'pocket:direct-cctp:'+b.source+':'+b.id
type Dependencies={durable():boolean;now():number;claim:typeof claimCirclePocketAction;find:typeof findCirclePocketAction;record:typeof recordCirclePocketAction;dispatch(q:EvmBridgeFeeQuote,id:string,session:string):Promise<{challengeId?:string}>;recover(q:EvmBridgeFeeQuote,id:string,session:string):Promise<string|null>;read(q:EvmBridgeFeeQuote,session:string,path:string):Promise<Record<string,unknown>>;prove:typeof readDirectCctpSource}
/** Internal adapter only. Caller authenticates Binding and validates/reprices the
 * sealed quote before execute. Do not mount until native recovery is connected. */
export function createDirectCctpReservations(overrides:Partial<Dependencies>={}){
 const d:Dependencies={durable:hasRenderDurableStore,now:Date.now,claim:claimCirclePocketAction,find:findCirclePocketAction,record:recordCirclePocketAction,prove:readDirectCctpSource,
  dispatch:async(q,id,userToken)=>(await import('../circle-solana-email.js')).createCircleGasStationEvmChallenge({chain:q.source as Source,walletId:q.walletId,walletAddress:q.walletAddress,userToken,refId:'pocket:bridge:'+id,idempotencyKey:id,callData:q.callData}),
  recover:async(q,id,userToken)=>(await import('../circle-solana-email.js')).recoverCircleNativeSendChallenge({chain:q.source as Source,walletId:q.walletId,walletAddress:q.walletAddress,userToken,refId:'pocket:bridge:'+id}),
  read:async(q,session,path)=>(await import('../circle-solana-email.js')).circleMigrationRequest(session,q.source as Source,path),...overrides}
 const check=(b:Binding,session:string)=>{if(!d.durable())fail('Bridge recovery storage is unavailable.',503);if(!b.ownerId||!uuid.test(b.id)||!['base','arbitrum','ethereum','polygon','arc'].includes(b.source)||!b.walletId||!/^0x[0-9a-f]{40}$/i.test(b.walletAddress)||!session||session.length>8000)fail('Authenticated bridge context is required.')}
 const saved=async(b:Binding)=>{
  const row=await d.find(b.ownerId,key(b),DIRECT_CCTP_ACTION);if(!row?.metadata?.approved)fail('Saved bridge reservation is unavailable.')
  const q=JSON.parse(row!.metadata!.approved) as EvmBridgeFeeQuote
  if(q.ownerId!==b.ownerId||q.source!==b.source||q.walletId!==b.walletId||q.walletAddress.toLowerCase()!==b.walletAddress.toLowerCase())fail('Bridge wallet binding changed.')
  return {row:row!,q}
 }
 async function execute(b:Binding,q:EvmBridgeFeeQuote,session:string,purpose?:'cash'){
  check(b,session)
  if(q.ownerId!==b.ownerId||q.source!==b.source||q.walletId!==b.walletId||q.walletAddress.toLowerCase()!==b.walletAddress.toLowerCase()||q.asset!=='USDC'||!['base','arbitrum','ethereum','polygon','arc','solana'].includes(q.destination)||q.destination===q.source)fail('Bridge quote binding changed.')
  if(purpose!==undefined&&(purpose!=='cash'||q.destination!=='base'))fail('Invalid Cash bridge purpose.')
  const approved=JSON.stringify(q),fingerprint=createHash('sha256').update(approved+'|'+(purpose||'')).digest('hex')
  const prior=await d.find(b.ownerId,key(b),DIRECT_CCTP_ACTION)
  if(prior){if(prior.metadata?.fingerprint!==fingerprint)fail('Bridge approval changed.');return prior}
  if(q.expiresAt<=d.now())fail('Bridge quote expired.')
  const claim=await d.claim({ownerId:b.ownerId,idempotencyKey:key(b),action:DIRECT_CCTP_ACTION,metadata:{approved,fingerprint,...(purpose?{purpose}:{}),source:b.source,walletAddress:b.walletAddress,intentFingerprint:b.source+':'+b.walletAddress.toLowerCase()},dedupe:{metadataKey:'intentFingerprint',metadataValue:b.source+':'+b.walletAddress.toLowerCase(),statuses:['started','submitted']}})
  if(!claim.claimed){if(claim.record.idempotencyKey!==key(b)||claim.record.metadata?.fingerprint!==fingerprint)fail('Another bridge from this wallet is pending.');return claim.record}
  // The claim means dispatch MAY have happened. Never expire or cancel it on a
  // timeout, process death, or background event, including before the response.
  try{const result=await d.dispatch(q,b.id,session);if(result.challengeId&&uuid.test(result.challengeId))return await d.record({...claim.record,status:'submitted',metadata:{...claim.record.metadata,challengeId:result.challengeId}})}catch{}
  return claim.record
 }
 async function resume(b:Binding,session:string){
  check(b,session);let {row,q}=await saved(b);if(terminal(row.status))return row
  const challengeId=row.metadata!.challengeId||await d.recover(q,b.id,session)
  if(!challengeId)return row
  if(!uuid.test(challengeId))fail('Invalid bridge confirmation reference.')
  row=await d.record({...row,status:'submitted',metadata:{...row.metadata,challengeId}})
  const path='/v1/w3s/user/challenges/'+encodeURIComponent(challengeId),response=await d.read(q,session,path),c=response.challenge as Record<string,unknown>|undefined
  if(!c)return row
  if(c.id!==challengeId)fail('Bridge confirmation changed.')
  // Only a saved/recovered challenge with an explicit empty correlation list and
  // provider terminal state can prove that signing never produced a transaction.
  if(Array.isArray(c.correlationIds)&&c.correlationIds.length===0&&['FAILED','EXPIRED','CANCELLED','CANCELED'].includes(String(c.status??c.state).toUpperCase())&&!row.metadata?.txHash)return d.record({...row,status:'not_submitted'})
  const txHash=await readCircleKitTransaction({challengeId,walletId:q.walletId,walletAddress:q.walletAddress,blockchain:({base:'BASE',arbitrum:'ARB',ethereum:'ETH',polygon:'MATIC',arc:'ARC'} as Record<string,string>)[q.source],refId:'pocket:bridge:'+b.id,callData:q.callData},p=>p===path?Promise.resolve(response):d.read(q,session,p))
  if(!txHash)return row
  row=await d.record({...row,status:'submitted',metadata:{...row.metadata,txHash}})
  const proof=await d.prove(q,txHash as Hex)
  return d.record({...row,status:proof.outcome==='source_confirmed'?'completed':'failed',metadata:{...row.metadata,sourceOutcome:proof.outcome,sourceBlockHash:proof.blockHash,sourceBlockNumber:proof.blockNumber}})
 }
 // Cancellation requests run the same read-only reconciliation. A locally closed
 // approval sheet cannot invalidate an outstanding provider challenge.
 return {execute,resume,cancel:resume,inspect:async(b:Binding,session:string)=>{check(b,session);return (await saved(b)).row}}
}

export function directCctpState(row:CirclePocketActionRecord){
 return {managed:true as const,status:row.status,challengeId:row.metadata?.challengeId,txHash:row.metadata?.txHash,sourceOutcome:row.metadata?.sourceOutcome,reservationReleased:terminal(row.status)}
}
export async function hasDirectCctpReservation(b:Binding){return !!await findCirclePocketAction(b.ownerId,key(b),DIRECT_CCTP_ACTION)}
/** Recovery remains available after rollout is disabled; only new dispatch is gated. */
export async function recoverDirectCctpReservation(b:Binding,session:string){
 const existing=await findCirclePocketAction(b.ownerId,key(b),DIRECT_CCTP_ACTION)
 if(!existing)return null
 const service=createDirectCctpReservations()
 await service.inspect(b,session) // Reject foreign/stale bindings before handling transient proof failures.
 try{return directCctpState(await service.resume(b,session))}
 catch{return {...directCctpState(await service.inspect(b,session)),verificationPending:true}}
}
export async function listDirectCctpPending(ownerId:string){
 if(!hasRenderDurableStore())return []
 const unresolved=await listCirclePocketActions(ownerId,500,DIRECT_CCTP_ACTION,true)
 if(unresolved.length===500)throw Error('Bridge recovery inventory needs reconciliation.')
 const recent=await listCirclePocketActions(ownerId,500,DIRECT_CCTP_ACTION)
 const rows=[...unresolved,...recent.filter(r=>r.status==='completed'&&r.metadata?.deliveryRecorded!=='true')]
 return rows.map(row=>{
  const q=JSON.parse(row.metadata!.approved) as EvmBridgeFeeQuote
  if(q.ownerId!==ownerId)throw Error('Bridge recovery owner mismatch.')
  return {id:row.idempotencyKey.split(':').at(-1)!,...(row.metadata?.purpose==='cash'?{purpose:'cash'}:{}),source:q.source,destination:q.destination,amount:formatUnits(BigInt(q.amountUnits),6),walletAddress:q.walletAddress,challengeId:row.metadata?.challengeId,txHash:row.metadata?.txHash,createdAt:row.createdAt,progress:row.metadata?.txHash?'submitted':'needs_attention',managedReservation:true,reservationReleased:terminal(row.status)}
 })
}
/** Called only after the existing authenticated bridge record proof succeeds. */
export async function acknowledgeDirectCctpDelivery(ownerId:string,source:string,txHash:string){
 if(!hasRenderDurableStore())return
 const rows=await listCirclePocketActions(ownerId,500,DIRECT_CCTP_ACTION)
 for(const row of rows)if(row.status==='completed'&&row.metadata?.source===source&&row.metadata?.txHash?.toLowerCase()===txHash.toLowerCase()&&row.metadata.deliveryRecorded!=='true')await recordCirclePocketAction({...row,metadata:{...row.metadata,deliveryRecorded:'true'}})
}

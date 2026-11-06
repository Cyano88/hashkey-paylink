import {hasRenderDurableStore,readDurableJson} from '../render-durable-store.js'
import type {CrossBridgeJournal,CrossBridgeReservation} from './cross-bridge-reservation-guard.js'

type Scope={id?:string;ownerId:string;source:string;walletAddress:string;from:string;destination:string;to:string;amountUnits?:string;totalUnits?:string}
type Grant={authorizedAt:number;expiresAt:number;ownerId:string;walletAddress:string;source:string;from:string;destination:string;to:string;maximumAmountUnits:string;maximumTotalUnits:string;retryId?:string;usedAt?:number;reason:string}
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,38}$/.test(v)
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const grants=(j:CrossBridgeJournal)=>j.manualBridgeRetries as Record<string,Grant>|undefined
/** Operator-created, bounded incident exception. No public API creates grants.
 * Original evidence remains untouched and all ordinary callers remain blocked. */
export function manualBridgeRetry(j:CrossBridgeJournal|undefined,s:Scope,now=Date.now()){
 if(!j)return
 for(const [originalId,g] of Object.entries(grants(j)??{})){
  const old=j.crossBridge?.[originalId]
  if(!old||old.state!=='submitting'||old.sourceHash||old.transactionId||old.userOperationHash||old.challengeId)continue
  if(!g||!Number.isSafeInteger(g.authorizedAt)||!Number.isSafeInteger(g.expiresAt)||g.authorizedAt>now||g.expiresAt<=now||g.expiresAt-g.authorizedAt>3600000||g.reason!=='owner_accepted_duplicate_execution_risk')continue
  if(g.ownerId!==s.ownerId||old.ownerId!==s.ownerId||g.source!==s.source||old.source!==s.source||!same(g.walletAddress,s.walletAddress)||!same(old.walletAddress,s.walletAddress)||g.from!==s.from||g.destination!==s.destination||g.to!==s.to)continue
  if(!units(g.maximumAmountUnits)||!units(g.maximumTotalUnits)||s.amountUnits!==undefined&&(!units(s.amountUnits)||BigInt(s.amountUnits)>BigInt(g.maximumAmountUnits))||s.totalUnits!==undefined&&(!units(s.totalUnits)||BigInt(s.totalUnits)>BigInt(g.maximumTotalUnits)))continue
  if(g.usedAt!==undefined&&(!Number.isSafeInteger(g.usedAt)||g.usedAt<g.authorizedAt||g.usedAt>now||g.retryId!==s.id))continue
  if(g.retryId&&g.retryId!==s.id){
   const previous=j.crossBridge?.[g.retryId]
   if(!previous||previous.sourceHash||previous.transactionId||previous.userOperationHash||previous.challengeId||!(['cancelled','not_submitted'].includes(previous.state)||previous.state==='prepared'&&previous.expiresAt<=now))continue
  }
  try{
   const q=JSON.parse(Buffer.from(String(old.quoteToken).split('.')[0],'base64url').toString())
   if(q.id!==originalId||q.ownerId!==s.ownerId||q.input.source!==s.source||q.input.from!==s.from||!same(q.wallets.source.address,s.walletAddress)||!units(q.totalUnits))continue
   return {originalId,reservedUnits:BigInt(q.totalUnits),grant:g}
  }catch{continue}
 }
}
export function retryScope(q:any):Scope{return {id:q.id,ownerId:q.ownerId,source:q.input.source,walletAddress:q.wallets.source.address,from:q.input.from,destination:q.input.destination,to:q.input.to,amountUnits:q.input.amountUnits,totalUnits:q.totalUnits}}
export async function readManualBridgeRetry(scope:Scope){
 if(!hasRenderDurableStore())return
 const j=await readDurableJson<CrossBridgeJournal>((process.env.CIRCLE_POCKET_ACTION_STORE_KEY??'hashpaylink:circle-pocket-actions').trim())
 return manualBridgeRetry(j,scope)
}
/** Called only inside the shared journal transaction before reservation checks. */
export function bindManualBridgeRetry(j:CrossBridgeJournal,next:CrossBridgeReservation,now:number){
 if(typeof next.quoteToken!=='string')return
 let q:any;try{q=JSON.parse(Buffer.from(next.quoteToken.split('.')[0],'base64url').toString())}catch{return}
 if(q.id!==next.id||q.ownerId!==next.ownerId||q.input?.source!==next.source||!q.wallets?.source?.address||!same(q.wallets.source.address,next.walletAddress))return
 const found=manualBridgeRetry(j,retryScope(q),now)
 if(!found)return
 found.grant.retryId=next.id
 if(next.state==='submitting')found.grant.usedAt=now
 return found.originalId
}

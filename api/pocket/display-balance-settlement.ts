import {readDurableJson} from '../render-durable-store.js'
import type {CircleLinkRecord} from '../privy-circle-link.js'
import type {CrossBridgeJournal} from './cross-bridge-reservation-guard.js'

type Asset={address?:string;native?:boolean;symbol?:string}
const same=(chain:string,a:unknown,b:string)=>typeof a==='string'&&(chain==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
/** A successful HTTP response is not fresh balance evidence when its token
 * snapshot predates a proven receipt. Only that wallet/asset falls back to RPC.
 * Share the journal read across all Home and selector balance consumers. */
export function createDisplaySettlementReader(read=()=>readDurableJson<CrossBridgeJournal>((process.env.CIRCLE_POCKET_ACTION_STORE_KEY??'hashpaylink:circle-pocket-actions').trim()),now=Date.now){
 let snapshot:CrossBridgeJournal|undefined,at=-Infinity,pending:Promise<void>|undefined
 return async(link:CircleLinkRecord,asset:Asset)=>{
  if(now()-at>=15000){
   if(!pending)pending=read().then(value=>{snapshot=value;at=now()}).finally(()=>{pending=undefined})
   await pending
  }
  let latest=0
  for(const op of Object.values(snapshot?.crossBridge??{})){
   if(op.ownerId!==link.privyUserId)continue
   const proof=(op.settlement??op.delivery) as any
   if(!proof||!['completed','refunded'].includes(proof.outcome)||proof.network!==link.chain||!same(link.chain,proof.recipient,link.circleWalletAddress)||!Number.isSafeInteger(proof.verifiedAt)||proof.verifiedAt<=0)continue
   const token=proof.token
   if(!token||(asset.native?token.native!==true||token.symbol!==asset.symbol:token.native===true||!same(link.chain,token.address,asset.address??'')))continue
   latest=Math.max(latest,proof.verifiedAt)
  }
  return latest
 }
}
export const readDisplaySettlement=createDisplaySettlementReader()
export function assertDisplaySnapshotCurrent(updated:unknown,settledAt:number){
 if(settledAt>0&&(typeof updated!=='string'||!Number.isFinite(Date.parse(updated))||Date.parse(updated)<settledAt))throw Error('Circle balance snapshot predates a verified receipt.')
}

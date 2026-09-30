import {pocketRequestRepository} from './request-store.js'
import {readDurableJson} from '../render-durable-store.js'
import {activityFeedKey,type ActivityFeed} from './activity-feed.js'
import {mergePocketActivityRows} from '../../src/pocket/lib/pocketActivitySnapshot.js'
import type {Request,Response} from 'express'
import {verifiedPrivyUser} from '../local-currency-profile.js'
import {readPocketNotificationActivity} from './activity.js'
import {readPocketNotices,savePocketNotices,markPocketNoticesRead} from './notification-store.js'
import {pocketMoneyNotification} from '../../src/pocket/lib/pocketMoneyNotification.js'
const hydration=new Map<string,{at:number;pending?:Promise<void>}>()
async function hydrate(owner:string){
 const existing=hydration.get(owner);if(existing?.pending)return existing.pending
 if(existing&&Date.now()-existing.at<15_000)return
 if(hydration.size>=200&&!existing)hydration.delete(hydration.keys().next().value!)
 const state={at:0,pending:undefined as Promise<void>|undefined};hydration.set(owner,state)
 state.pending=(async()=>{const [context,requests]=await Promise.all([readPocketNotificationActivity(owner),pocketRequestRepository.listFor(owner)]);const feed=await readDurableJson<ActivityFeed>(activityFeedKey(owner));const ignored=new Set([...requests.flatMap(r=>r.transactionHash?[r.transactionHash]:[]),...context.flatMap(r=>[r.refundTxHash,...(r.paymentFunding||[]).flatMap(f=>[f.txHash,f.destinationTxHash]),...(r.source==='wallet-bridge'?[r.txHash,r.destinationTxHash]:[])])].filter(Boolean).map(h=>h!.toLowerCase()));for(const source of Object.values(feed?.sources||{}))for(const hash of source.snapshot.groupedTransactionHashes||[])ignored.add(hash.toLowerCase());const wallets=(feed?.sources.wallets?.snapshot.payments||[]).filter(r=>!ignored.has(r.txHash.toLowerCase()));const rows=mergePocketActivityRows(wallets,context);await savePocketNotices(owner,rows.flatMap(row=>{const n=pocketMoneyNotification(row);return n&&n.occurredAt>Date.now()-30*24*60*60_000?[n]:[]}));state.at=Date.now()})().finally(()=>{state.pending=undefined})
 return state.pending
}
export function createPocketNotificationsHandler(deps={verifyUser:verifiedPrivyUser,hydrate,read:readPocketNotices,markRead:markPocketNoticesRead}) {
return async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','private, no-store')
 if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({ok:false})
 try{
  const {userId}=await deps.verifyUser(req)
  let partial=false
  if(req.method==='POST'){
   if(req.body?.action!=='mark-read'||!Array.isArray(req.body.ids)||req.body.ids.length>200||!req.body.ids.every((id:unknown)=>typeof id==='string'&&id.length<1000))return res.status(400).json({ok:false})
   await deps.markRead(userId,req.body.ids)
  }else{
   await deps.hydrate(userId).catch(()=>{partial=true})
  }
  const notices=await deps.read(userId)
  return res.json({ok:true,notices,partial,unreadCount:notices.filter(n=>!n.readAt).length})
 }catch(e){const status=(e as {status?:number}).status;return res.status(status===401||status===403?status:503).json({ok:false,error:{message:'Notifications could not refresh.'}})}
}

}
export default createPocketNotificationsHandler()

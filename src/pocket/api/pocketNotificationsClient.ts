import {isPocketInboxNotice,type PocketNoticeCategory} from '../lib/pocketInboxPolicy'
import {pocketApiUrl} from '../lib/pocketRoutes'
export type PocketNotice={category?:PocketNoticeCategory;id:string;eventId:string;title:string;body:string;path:string;createdAt:number;updatedAt:number;readAt?:number}
type Inbox={notices:PocketNotice[];unreadCount:number}
const cache=new Map<string,{value?:Inbox;at:number;pending?:Promise<Inbox>}>()
export async function readPocketNotifications(token:string){
 let entry=cache.get(token)
 if(entry?.pending)return entry.pending
 if(entry?.value&&Date.now()-entry.at<10_000)return entry.value
 if(!entry){if(cache.size>=4)cache.delete(cache.keys().next().value!);entry={at:0};cache.set(token,entry)}
 const current=entry
 current.pending=(async()=>{
 const r=await fetch(pocketApiUrl('/api/pocket/notifications'),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),cache:'no-store'})
 const b=await r.json();if(!r.ok||!b.ok||!Array.isArray(b.notices))throw Error('Notifications could not refresh.')
 const notices=(b.notices as PocketNotice[]).filter(isPocketInboxNotice);const inbox:Inbox={notices,unreadCount:notices.filter(n=>!n.readAt).length};current.value=inbox;current.at=Date.now();return inbox
 })().finally(()=>{current.pending=undefined})
 return current.pending
}
export async function markPocketNotificationsRead(token:string,ids:string[]){
 const r=await fetch(pocketApiUrl('/api/pocket/notifications'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'mark-read',ids}),signal:AbortSignal.timeout(12000)})
 if(!r.ok)throw Error('Notifications could not be marked read.')
 const entry=cache.get(token);if(entry?.value){entry.value.notices=entry.value.notices.map(n=>ids.includes(n.eventId)?{...n,readAt:Date.now()}:n);entry.value.unreadCount=entry.value.notices.filter(n=>!n.readAt).length}
 window.dispatchEvent(new Event('pocket:requests-updated'))
}

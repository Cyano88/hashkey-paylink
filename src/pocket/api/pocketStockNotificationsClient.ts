import { pocketApiUrl } from '../lib/pocketRoutes'
export type StockInbox = { notices: {id:string;title:string;body:string;at:number;hash?:string;requestId?:string;transfer?:{token:string;symbol:string;amount:string;from:string;to:string;direction:'in'|'out'}}[]; unread:number; requests:{id:string;direction:'incoming'|'outgoing';senderPocketId:string;payerPocketId:string;address:string;token:string;symbol:string;amount:string;status:'pending'|'accepted'|'declined'|'paid';at:number;updatedAt:number;txHash?:string}[] }
export async function stockNotificationsRequest(getAccessToken:()=>Promise<string|null>,body?:Record<string,unknown>,activity=false):Promise<StockInbox>{
 const token=await getAccessToken();if(!token)throw Error('Sign in to Pocket again.')
 const response=await fetch(pocketApiUrl('/api/pocket/xstocks/notifications'+(activity?'?activity=1':'')),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),cache:'no-store'})
 const data=await response.json();if(!response.ok||!data.ok)throw Error(typeof data.error==='string'?data.error:'Stock notifications unavailable.')
 return data
}
const registered=new Map<string,Promise<unknown>>()
export function registerStockNotifications(owner:string,wallet:string,getAccessToken:()=>Promise<string|null>){const key=owner+':'+wallet.toLowerCase();if(!registered.has(key)){const work=stockNotificationsRequest(getAccessToken,{action:'register',wallet}).catch(e=>{registered.delete(key);throw e});registered.set(key,work)}return registered.get(key)!}

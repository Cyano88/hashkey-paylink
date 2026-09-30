import {createHash} from 'node:crypto'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
export type PocketNotice={id:string;eventId:string;title:string;body:string;path:string;createdAt:number;updatedAt:number;readAt?:number;occurredAt:number}
type Store={items:PocketNotice[]}
const key=(owner:string)=>'pocket:notifications:v1:'+createHash('sha256').update(owner).digest('hex')
export function upsertPocketNotice(items:PocketNotice[],eventId:string,input:{title:string;body:string;path:string;tag?:string;occurredAt?:number},now=Date.now()) {
 const id=input.tag||eventId,previous=items.find(n=>n.id===id),occurredAt=input.occurredAt??now
 if(previous&&(previous.eventId===eventId||previous.occurredAt>occurredAt||previous.eventId.endsWith(':refunded')&&!eventId.endsWith(':refunded')))return items
 const item:PocketNotice={id,eventId,title:input.title,body:input.body,path:input.path,createdAt:previous?.createdAt||occurredAt,updatedAt:occurredAt,occurredAt}
 return [item,...items.filter(n=>n.id!==id)].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,200)
}
export async function savePocketNotice(owner:string,eventId:string,input:{title:string;body:string;path:string;tag?:string;occurredAt?:number}){
 await mutateDurableJson<Store>(key(owner),current=>({items:upsertPocketNotice(current?.items||[],eventId,input)}))
}
export async function readPocketNotices(owner:string){return (await readDurableJson<Store>(key(owner)))?.items||[]}
export async function markPocketNoticesRead(owner:string,ids:string[]){await mutateDurableJson<Store>(key(owner),current=>({items:(current?.items||[]).map(n=>ids.includes(n.eventId)?{...n,readAt:Date.now()}:n)}))}

export async function savePocketNotices(owner:string,notices:Array<{eventId:string;title:string;body:string;path:string;tag?:string;occurredAt?:number}>){
 if(!notices.length)return
 await mutateDurableJson<Store>(key(owner),current=>({items:notices.reduce((items,n)=>upsertPocketNotice(items,n.eventId,n),current?.items||[])}))
}

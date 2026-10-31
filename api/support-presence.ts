import {mutateDurableJson,readDurableJson} from './render-durable-store.js'
type Presence={user?:number;staff?:number}
export type SupportSide='user'|'staff'
const key=(id:string)=>'hashpaylink:support-presence:v1:'+id
export const supportPresence={
 async read(id:string,side:SupportSide,now:number){const value=await readDurableJson<Presence>(key(id));return {expiresIn:Math.max(0,Math.min(8000,(value?.[side]||0)-now))}},
 async set(id:string,side:SupportSide,typing:boolean,now:number){await mutateDurableJson<Presence>(key(id),value=>({...value,[side]:typing?now+8000:0}))},
}

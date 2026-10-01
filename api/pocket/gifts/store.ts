import {mutateDurableJson,readDurableJson} from '../../render-durable-store.js'
import {GiftError,giftIdValid,type GiftRecord} from './types.js'
export type GiftStore={read(id:string):Promise<GiftRecord|undefined>;update(id:string,fn:(current:GiftRecord|undefined)=>GiftRecord):Promise<GiftRecord>}
const key=(id:string)=>{if(!giftIdValid(id))throw new GiftError(400,'Invalid gift.');return 'hashpaylink:pocket-gift:v1:'+id}
// Per-gift Postgres row lock; no process-local lock or ephemeral production fallback.
export const durableGiftStore:GiftStore={read:id=>readDurableJson<GiftRecord>(key(id)),update:(id,fn)=>mutateDurableJson<GiftRecord>(key(id),fn)}

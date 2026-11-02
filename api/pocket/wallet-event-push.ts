import {createHash} from 'node:crypto'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'
type Pending=Record<string,PocketActivityRow>
const key=(owner:string)=>'pocket:wallet-event-push:v1:'+createHash('sha256').update(owner).digest('hex')
export function mergeWalletEventPushes(current:Pending|undefined,rows:PocketActivityRow[]):Pending{
 const next={...current}
 for(const row of rows){if(!next[row.eventId]&&Object.keys(next).length>=1000)throw Error('Wallet event push queue full.');next[row.eventId]=row}
 return next
}
export async function queueWalletEventPushes(owner:string,rows:PocketActivityRow[]){
 if(rows.length)await mutateDurableJson<Pending>(key(owner),old=>mergeWalletEventPushes(old,rows))
}
export async function readWalletEventPushes(owner:string){return Object.values(await readDurableJson<Pending>(key(owner))||{})}
export async function acknowledgeWalletEventPushes(owner:string,ids:string[]){
 if(ids.length)await mutateDurableJson<Pending>(key(owner),old=>{const next={...old};for(const id of ids)delete next[id];return next})
}

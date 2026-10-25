import type {PocketActivityRow} from '../../src/pocket/models/pocketActivity.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
const key='pocket:deferred-transfer-push:v1'
type Store=Record<string,PocketActivityRow[]>
export async function readDeferredTransferPushes(owner:string){return (await readDurableJson<Store>(key))?.[owner]||[]}
export async function saveDeferredTransferPushes(owner:string,rows:PocketActivityRow[]){
 await mutateDurableJson<Store>(key,current=>{
  const next={...current};if(rows.length)next[owner]=rows;else delete next[owner];return next
 })
}

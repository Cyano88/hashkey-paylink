import assert from 'node:assert/strict'
import {deliverStockNotices,normalizeStockNotices} from '../api/pocket/xstocks-notifications-store.ts'
import {pocketNotificationPath} from '../src/pocket/lib/pocketNotificationPath.ts'
const hash='0x'+'a'.repeat(64),store=normalizeStockNotices(),sent=[]
for(const direction of ['sent','received'])store.notices[direction]={id:direction,owner:direction,title:'Web payment '+direction,body:'1.50 USDT',at:Date.now()-60000,hash}
await deliverStockNotices({configured:()=>true,listOwners:async()=>['sent','received'],read:async()=>store,listActions:async()=>[],mutate:async fn=>{fn(store);return store},send:async(...args)=>{sent.push(args);return true}})
assert.equal(sent.length,2)
for(const notice of sent)assert.equal(notice[2].path,'/activity?receipt='+hash)
assert.equal(pocketNotificationPath('/xstocks/activity?receipt='+hash),'/activity?receipt='+hash)
assert.equal(pocketNotificationPath('/xstocks/activity?receipt=request-id'),'/xstocks/activity?receipt=request-id')
assert.equal(pocketNotificationPath('https://evil.example/activity?receipt='+hash),null)
console.log('PASS payer/merchant push delivery routes, old hash-link compatibility, request-route preservation.')

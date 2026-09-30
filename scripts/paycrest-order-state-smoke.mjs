import assert from 'node:assert/strict'
import {mergePaycrestOrder,updatePaycrestOrderStore} from '../api/paycrest-order-state.ts'
const initial={intent_id:'a',paycrest_order_id:'pa',status:'settling',updated_at:'2026-09-29T01:00:00Z',amount_usdc:'1'}
const settled={...initial,status:'settled',updated_at:'2026-09-29T01:00:02Z',tx_hash:'0xpaid'}
const late={...initial,updated_at:'2026-09-29T01:00:03Z'}
assert.equal(mergePaycrestOrder(settled,late).status,'settled')
assert.equal(mergePaycrestOrder(settled,late).tx_hash,'0xpaid')
assert.equal(mergePaycrestOrder(settled,{...late,status:'refunding'}).status,'refunding')
assert.equal(mergePaycrestOrder({...settled,status:'refunded'},late).status,'refunded')
const b={...initial,intent_id:'b',paycrest_order_id:'pb'}
let store=updatePaycrestOrderStore(undefined,initial);store=updatePaycrestOrderStore(store,b);store=updatePaycrestOrderStore(store,settled);store=updatePaycrestOrderStore(store,late)
assert.equal(store.orders.a.status,'settled');assert.equal(store.orders.pa.status,'settled');assert.equal(store.orders.b.intent_id,'b');assert.equal(store.orders.pb.intent_id,'b')
assert.throws(()=>mergePaycrestOrder(settled,b),/identity/)
console.log('PASS late payout reads cannot downgrade settled/refunded orders; single-order writes retain concurrent orders and aliases')

const expired={...initial,status:'expired'}
let replacement=updatePaycrestOrderStore(undefined,expired)
const fresh={...initial,paycrest_order_id:'new',status:'initiated'}
replacement=updatePaycrestOrderStore(replacement,fresh,true)
replacement=updatePaycrestOrderStore(replacement,{...expired,updated_at:'2026-09-30T00:00:00Z'})
assert.equal(replacement.orders.a.paycrest_order_id,'new')
assert.equal(replacement.orders.pa.status,'expired')
assert.throws(()=>updatePaycrestOrderStore(store,fresh,true),/Funded/)
console.log('PASS expired quotes can be replaced; late old-order updates cannot replace the active payout')

assert.equal(mergePaycrestOrder(settled,{...late,status:'failed'}).status,'settled')
assert.equal(mergePaycrestOrder({...settled,status:'refunded'},{...late,status:'failed'}).status,'refunded')

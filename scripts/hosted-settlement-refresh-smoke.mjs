import assert from 'node:assert/strict'
import {createHostedSettlementRefresh} from '../api/hosted-settlement-refresh.ts'
let now=10000,calls=0,order={source:'hosted-checkout',paycrest_order_id:'provider_one'},fail=false
const record={id:'checkout_one',payment:{status:'processing',txHash:'0x'+'a'.repeat(64)},settlement:{provider:'paycrest',intentId:'intent_one',orderId:'provider_one'}}
let refresh
refresh=createHostedSettlementRefresh({now:()=>now,read:async()=>order,refresh:async id=>{calls++;assert.equal(id,'intent_one');await refresh(record);if(fail)throw Error('provider offline')}})
await Promise.all([refresh(record),refresh(record)]);assert.equal(calls,1,'Concurrent/reentrant reads must not refetch or deadlock')
await refresh(record);assert.equal(calls,1)
now+=10000;fail=true;await refresh(record);assert.equal(calls,2);assert.equal(record.payment.status,'processing')
now+=10000;fail=false;await refresh(record);assert.equal(calls,3)
for(const bad of [{...record,payment:undefined},{...record,payment:{...record.payment,status:'paid'}},{...record,payment:{...record.payment,txHash:''}},{...record,settlement:undefined}]){now+=10000;await refresh(bad)}
assert.equal(calls,3)
now+=10000;order={...order,paycrest_order_id:'other_order'};await refresh(record);assert.equal(calls,3)
now+=10000;order={source:'bank-withdraw',paycrest_order_id:'provider_one'};await refresh(record);assert.equal(calls,3)
console.log('PASS funded settlement refresh: exact provider binding, cooldown, concurrent and recursive dedupe, outage recovery, no unpaid or terminal refresh; no transfer capability.')

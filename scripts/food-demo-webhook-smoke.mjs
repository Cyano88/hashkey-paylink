import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {createFoodDemoWebhook} from '../api/food-demo-webhook.ts'
const secret='fixture-secret-'.repeat(4),now=1793160000000,events={};let calls=0,pending=false
const handler=createFoodDemoWebhook({secret:()=>secret,ready:()=>true,now:()=>now,read:async()=>events,record:async(id,hash,at)=>{events[id]={hash,at}},reconcile:async id=>{assert.equal(id,'chk_12345678');calls++;if(pending)throw Error('Pending')}})
const payload={id:'evt_1',event:'payment.confirmed',data:{checkoutId:'chk_12345678',amount:'1'}}
async function request(value=payload,{timestamp=Math.floor(now/1000),key=secret,raw}={}){const body=Buffer.from(raw||JSON.stringify(value));let status=200,data;await handler({method:'POST',body,headers:{'x-hashpaylink-signature':`t=${timestamp},v1=${createHmac('sha256',key).update(timestamp+'.'+body.toString()).digest('hex')}`}},{setHeader(){},status(n){status=n;return this},json(d){data=d;return this}});return{status,data}}
assert.equal((await request(payload,{key:'wrong'})).status,401)
assert.equal((await request(payload,{timestamp:Math.floor(now/1000)-301})).status,401)
assert.equal(calls,0)
assert.equal((await request()).status,200);assert.equal(calls,1)
assert.equal((await request()).data.duplicate,true);assert.equal(calls,1)
assert.equal((await request({...payload,data:{...payload.data,amount:'2'}})).status,409)
pending=true
assert.equal((await request({...payload,id:'evt_2'})).status,503);assert.equal(events.evt_2,undefined)
pending=false
assert.equal((await request({...payload,id:'evt_2'})).status,200)
assert.equal((await request({...payload,id:'evt_3',event:'payment.processing'})).data.ignored,true)
assert.equal((await request(payload,{raw:'not-json'})).status,400)
console.log('PASS signed raw-body webhook: invalid/stale rejected, duplicate idempotency, conflict rejected, pending retries, authoritative status required.')

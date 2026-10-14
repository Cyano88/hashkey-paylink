import assert from 'node:assert/strict'
import {createDurablePocketActivityHandler} from '../api/pocket/activity-feed.ts'
import {isPocketActivityReadData} from '../src/pocket/lib/pocketSchemas.ts'

const now=Date.now(),hash='0x'+'a'.repeat(64)
const base={eventId:'esim_paid',source:'esim',chain:'base',payer:'payer',memo:'Nigeria data',amount:'0.95',txHash:hash,refundTxHash:'',ts:now}
const bill={eventId:'tv_paid',source:'bills',chain:'base',payer:'payer',memo:'DSTV',amount:'22.17',txHash:'0x'+'b'.repeat(64),ts:now+1,billCategory:'tv'}
const saved={version:1,sources:{esim:{startedAt:now,updatedAt:now,snapshot:{payments:[base,{...base,eventId:'esim_unpaid',txHash:''}],merchants:[],collections:[]}},bills:{startedAt:now,updatedAt:now,snapshot:{payments:[bill],merchants:[],collections:[]}}}}
const before=JSON.stringify(saved)
const handler=createDurablePocketActivityHandler({now:()=>now,verifyUser:async()=>({userId:'owner'}),sources:{esim:async()=>{throw Error('Must use cache')},bills:async()=>{throw Error('Must use cache')}},store:{read:async()=>saved,mutate:async()=>{throw Error('Must not mutate source records')}}})
for(const scope of [undefined,'recent']){
 let body;const res={setHeader(){},status(){return this},json(value){body=value;return this}}
 await handler({method:'GET',query:{scope}},res)
 assert.equal(body.ok,true)
 assert.equal(isPocketActivityReadData(body),true,'Cached eSIM must not invalidate TV activity')
 assert.deepEqual(body.payments.map(r=>r.eventId),['tv_paid','esim_paid'])
 assert.equal('refundTxHash' in body.payments[1],false)
}
assert.equal(JSON.stringify(saved),before,'Compatibility repair must preserve durable financial records')
console.log('PASS cached eSIM compatibility: TV and eSIM visible in full/recent Activity without mutating orders')

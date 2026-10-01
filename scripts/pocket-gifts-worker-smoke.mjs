import assert from 'node:assert/strict'
import {createGiftReconciler,giftReconciliationComplete} from '../api/pocket/gifts/reconciler.ts'
const schedules=[],time=1000000
const base={state:'available',expiresAt:'99999',observedBlock:'8000',evidenceScanBlock:'1999'}
assert.equal(giftReconciliationComplete({...base,state:'claimed',fundingHash:'a'}),false)
assert.equal(giftReconciliationComplete({...base,state:'claimed',fundingHash:'a',fundingAt:1,settlementHash:'b',settlementAt:2,claimRecipient:'c'}),true)
assert.equal(giftReconciliationComplete({...base,state:'unfunded',expiresAt:'100',observedTimestamp:'101'}),true)
assert.equal(giftReconciliationComplete({...base,state:'refunded',fundingHash:'a',fundingAt:1,refundHash:'b',refundAt:2}),true)
let release
const run=createGiftReconciler({now:()=>time,list:async()=>['timeout','old','settled'],refresh:async id=>{if(id==='timeout')throw Error('RPC unavailable');if(id==='old')await new Promise(r=>release=r);return id==='settled'?{...base,state:'refunded',fundingHash:'a',fundingAt:1,refundHash:'b',refundAt:2}:base},schedule:async(...args)=>schedules.push(args)})
const first=run();while(!release)await new Promise(r=>setTimeout(r,1));assert.deepEqual(await run(),{checked:0,deferred:0});release();assert.deepEqual(await first,{checked:2,deferred:1})
assert.deepEqual(schedules[0],['timeout',time+60000,false]);assert.deepEqual(schedules[1],['old',time+30000,false]);assert.equal(schedules[2][2],true)
console.log('PASS gift worker: bounded batch, no overlapping runs, failure isolation, historical catch-up and verified completion only.')

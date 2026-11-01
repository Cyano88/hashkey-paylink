import assert from 'node:assert/strict'
import {createFairOwnerBatch} from '../api/pocket/fair-owner-batch.ts'
import {createDurablePocketActivityHandler} from '../api/pocket/activity-feed.ts'
let cursor, mutations=0
const mutate=async update=>{mutations++;return cursor=update(cursor)}
let select=createFairOwnerBatch(mutate)
const owners=Array.from({length:121},(_,i)=>'owner-'+String(i).padStart(3,'0'))
const seen=new Set()
for(let i=0;i<3;i++){const batch=await select(owners,50);assert.equal(new Set(batch).size,50);batch.forEach(x=>seen.add(x));select=createFairOwnerBatch(mutate)}
assert.equal(seen.size,121,'All owners get a turn even across worker restarts')
assert.deepEqual(await select(['one','one'],50),['one']);assert.equal(mutations,3)
const changed=await select([...owners.slice(70),'new-owner'],10);assert.equal(new Set(changed).size,10)
assert(changed.every(x=>owners.slice(70).includes(x)||x==='new-owner'))

let now=100000,calls=0,fail=false
const rows={payments:[],merchants:[],collections:[]},data=new Map()
const handler=createDurablePocketActivityHandler({now:()=>now,verifyUser:async req=>({userId:req.owner}),store:{read:async key=>data.get(key),mutate:async(key,update)=>{const next=update(data.get(key));data.set(key,next);return next}},sources:{wallets:async()=>{calls++;if(fail)throw Error('provider');return rows}},coldWaitMs:20})
const request=async(query={},owner='a')=>{const res={setHeader(){},status(){return this},json(value){this.body=value;return this}};await handler({method:'GET',query,owner},res);return res.body}
assert.equal((await request({observe:'1',refresh:'1'})).complete,false);assert.equal(calls,0,'Observation never starts a scan, including a cold account')
assert.equal((await request()).complete,true);assert.equal(calls,1)
now+=20000;await request();assert.equal(calls,1,'Healthy source is reused for a minute')
now+=60000;await request({observe:'1'});assert.equal(calls,1,'Stale observations remain read-only')
fail=true;await request({refresh:'1'});assert.equal(calls,2)
now+=6000;await request();await new Promise(r=>setTimeout(r,5));assert.equal(calls,2,'Failed source backs off independently')
now+=10000;await request();await new Promise(r=>setTimeout(r,5));assert.equal(calls,3)
now+=6000;await request();await new Promise(r=>setTimeout(r,5));assert.equal(calls,3,'Repeated failures increase backoff')
now+=6000;fail=false;const recovered=await request({refresh:'1'});assert.equal(calls,4,'Explicit refresh can recover without waiting for automatic cooldown');assert.equal(recovered.partial,false)
assert.equal((await request({observe:'1'},'b')).complete,false,'Other owner cannot see a saved ready-empty state')
console.log('PASS persistent fair owner rotation, owner changes, read-only activity observations, ready-empty isolation, source backoff and manual recovery. No funds moved.')

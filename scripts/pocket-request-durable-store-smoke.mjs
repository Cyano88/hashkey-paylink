import assert from 'node:assert/strict'
import {createPaylinkRequestStore} from '../api/pocket/paylink-request-store.ts'
let value, queue=Promise.resolve()
const options={durable:true,production:true,readDurable:async()=>structuredClone(value),mutateDurable:async(_key,fn)=>{
 const operation=queue.then(async()=>{const next=await fn(structuredClone(value));value=structuredClone(next);return structuredClone(next)})
 queue=operation.then(()=>{},()=>{});return operation
}}
const first=createPaylinkRequestStore(options), second=createPaylinkRequestStore(options)
await Promise.all(Array.from({length:20},(_,i)=>(i%2?first:second).mutate(store=>{store.requests[i]={id:String(i)}})))
assert.equal(Object.keys((await first.read()).requests).length,20)
const restarted=createPaylinkRequestStore(options)
assert.equal(Object.keys((await restarted.read()).requests).length,20)
const prior=structuredClone(value)
await assert.rejects(first.mutate(store=>{store.requests.bad={id:'wrong'};}),e=>e.status===503)
assert.deepEqual(value,prior)
value={requests:[]}
await assert.rejects(first.read(),e=>e.status===503)
await assert.rejects(first.mutate(()=>{}),e=>e.status===503)
const unavailable=createPaylinkRequestStore({durable:false,production:true,storePath:'must-not-create.json'})
await assert.rejects(unavailable.read(),e=>e.status===503)
await assert.rejects(unavailable.mutate(()=>{}),e=>e.status===503)
const outage=createPaylinkRequestStore({...options,readDurable:async()=>{throw Error('private database details')},mutateDurable:async()=>{throw Error('private database details')}})
await assert.rejects(outage.read(),e=>e.status===503&&!e.message.includes('private'))
await assert.rejects(outage.mutate(()=>{}),e=>e.status===503&&!e.message.includes('private'))
console.log('Durable request adapter passed: shared transactions, restart persistence, rollback, corrupt data and fail-closed production behavior')

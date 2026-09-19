import assert from 'node:assert/strict'
import { createArchiveLookupCache } from '../api/archive-lookup-cache.ts'
import handler from '../api/agent-verify.ts'
let now = 0, calls = 0, release
const lookup = createArchiveLookupCache(async () => { calls++; await new Promise(r => { release=r }); return { proof: { value: 1 } } }, () => now)
const first=lookup('event','Alice'), second=lookup('event','ALICE')
await Promise.resolve(); assert.equal(calls,1); release()
const [a,b]=await Promise.all([first,second]); a.proof.value=9; assert.equal(b.proof.value,1)
assert.equal((await lookup('event','alice')).proof.value,1); assert.equal(calls,1)
now=30001; const fresh=lookup('event','Alice'); await Promise.resolve(); assert.equal(calls,2); release(); await fresh
let negativeCalls=0
const negative=createArchiveLookupCache(async()=>{negativeCalls++; return null},()=>now)
await negative('e','p'); await negative('e','P'); assert.equal(negativeCalls,1)
now+=5001; await negative('e','p'); assert.equal(negativeCalls,2)
let attempts=0
const retry=createArchiveLookupCache(async()=>{if(++attempts===1) throw Error('provider failure');return {ok:true}})
await assert.rejects(retry('e','p')); assert.deepEqual(await retry('e','p'),{ok:true})
const releases=[]
const bounded=createArchiveLookupCache(()=>new Promise(r=>releases.push(r)))
const pending=Array.from({length:4},(_,i)=>bounded('e'+i,'p'))
await assert.rejects(bounded('extra','p'),/busy/)
await Promise.resolve(); releases.forEach(r=>r(null)); await Promise.all(pending)
let evictions=0
const cache=createArchiveLookupCache(async()=>{evictions++; return null},()=>0)
for(let i=0;i<257;i++) await cache('e'+i,'p')
await cache('e0','p'); assert.equal(evictions,258)
let untouched=0
const validation=createArchiveLookupCache(async()=>{untouched++;return null})
await assert.rejects(validation(' ','p')); await assert.rejects(validation('e','x'.repeat(129))); assert.equal(untouched,0)
for(const query of [{}, {eventId:['e'],payer:'p'}, {eventId:'e',payer:'x'.repeat(129)}]) {
 const res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}
 await handler({query},res);assert.equal(res.statusCode,400);assert.equal(res.body.verified,false)
}
console.log('Archive containment passed: shared reads, isolation, TTLs, retry, concurrency, eviction and input validation')

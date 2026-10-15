import assert from 'node:assert/strict'
import {advanceEarnHistory,totalEarnInterest,EARN_RAY} from '../api/pocket/earn-interest-history.ts'
import {createEarnEarningsHandler} from '../api/pocket/earn-earnings.ts'
const target={block:'1000',hash:'h1000',index:'130',interest:'0'},events=[{block:10n,index:100n,interest:0n},{block:100n,index:110n,interest:7n},{block:101n,index:120n,interest:4n},{block:900n,index:130n,interest:9n}]
let reads=0
const reader={index:async b=>{reads++;return events.filter(e=>e.block<=b).at(-1)?.index||0n},hash:async b=>'h'+b,interest:async(b,i)=>{const e=events.find(e=>e.block===b);assert.equal(e.index,i);return e.interest}}
let s=await advanceEarnHistory({version:1},target,reader,2);assert.ok(s.pending);assert.equal(s.earnedUnits,undefined)
s=await advanceEarnHistory(JSON.parse(JSON.stringify(s)),target,reader,2);assert.equal(s.pending,undefined);assert.equal(s.checkpoint.interest,'20');assert.ok(reads<60,'Sparse history avoids scanning every block')
const again=await advanceEarnHistory(s,target,reader);assert.equal(again.checkpoint.interest,'20','Repeated refresh does not duplicate interest')
events.push({block:1001n,index:140n,interest:3n});s=await advanceEarnHistory(s,{...target,block:'1100',hash:'h1100',index:'140'},reader);assert.equal(s.checkpoint.interest,'23')
const reset=await advanceEarnHistory(s,{...target,block:'1100',hash:'h1100',index:'140'},{...reader,hash:async b=>b===1100n?'newhash':'h'+b},1);assert.ok(reset.pending);assert.equal(reset.pending.base,null,'Reorg invalidates checkpoint')
await assert.rejects(()=>advanceEarnHistory(s,{...target,index:'1'},reader),/backwards/)
await assert.rejects(()=>advanceEarnHistory({version:1},target,{...reader,interest:async()=>{throw Error('RPC unavailable')}}),/RPC unavailable/)
assert.equal(totalEarnInterest(500n,1000000n,EARN_RAY,1010000n),10500n)
assert.equal(totalEarnInterest(500n,0n,EARN_RAY,0n),500n,'Full withdrawal retains earned interest')
assert.equal(totalEarnInterest(0n,9999n,EARN_RAY,9999n),0n,'Principal and supply rounding are not interest')
assert.equal(totalEarnInterest(7n,100000000000000000000n,EARN_RAY,100000000000000000003n),10n,'No floating point loss')
await assert.rejects(async()=>totalEarnInterest(0n,100n,EARN_RAY,99n),/inconsistent/)
const owner='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';let called=0
const handler=createEarnEarningsHandler({verifyUser:async()=>({userId:'owner'}),readWallets:async()=>({wallets:{owner:{address:owner}}}),readEarnings:async()=>{called++;return {status:'ready',earnedUnits:'123',asOf:Date.now()}}})
async function request(method,query){const res={code:200,setHeader(){},status(c){this.code=c;return this},sendStatus(c){this.code=c;return this},json(v){this.body=v;return this}};await handler({method,query},res);return res}
assert.equal((await request('GET',{symbol:'USDC',wallet:other})).code,403);assert.equal(called,0)
assert.equal((await request('GET',{symbol:'OTHER',wallet:owner})).code,400);assert.equal((await request('POST',{})).code,405)
assert.equal((await request('GET',{symbol:'USDC',wallet:owner})).body.earnedUnits,'123')
console.log('PASS earned interest: sparse complete history, durable resume, repeated refresh, full withdrawal, principal exclusion, integer precision, reorg reset, RPC failures and owner authorization')

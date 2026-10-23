import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {createBscBridgeOperations} from '../api/pocket/bsc-bridge-operations.ts'
const quotes=['USDC','USDT'].map(asset=>({version:1,id:randomUUID(),ownerId:'fixture-owner',walletId:'fixturewallet123',walletAddress:'0x'+'1'.repeat(40),destinationAddress:'0x'+'2'.repeat(40),source:'bsc',destination:'base',asset,from:asset,amountUnits:'10000000000000000000',totalInputUnits:'10003000000000000000',reimbursementUnits:'3000000000000000',receiveUnits:'9900000',minimumOutUnits:'9850500',orderId:'0x'+'c'.repeat(64),requestId:'0x'+'d'.repeat(64),issuedAt:Date.now(),expiresAt:Date.now()+30000}))
const hash='0x'+'a'.repeat(64),userOp='0x'+'b'.repeat(64)
function fixture(q=quotes[0]){
 let store,queue=Promise.resolve()
 const s={now:q.issuedAt,sendCount:0,approve:true,preflight:true,response:{ok:true,status:200,body:{data:{hash,transaction_id:'transaction123456',user_operation_hash:userOp,caip2:'eip155:56'}}},result:{status:'completed',amountOutUnits:q.receiveUnits,...(q.from==='BNB'?{nativeFeeUnits:'1'}:{})},failSend:false,providerChain:'eip155:56'}
 const d={appId:'fixtureappid',now:()=>s.now,read:async()=>structuredClone(store),mutate:fn=>{
  const work=queue.then(()=>{const next=fn(structuredClone(store));store=structuredClone(next);return structuredClone(next)})
  queue=work.catch(()=>{});return work
 },approve:async()=>s.approve,preflight:async()=>{if(!s.preflight)throw Error('Insufficient balance')},send:async request=>{s.sendCount++;assert.equal(request.body.caip2,'eip155:56');if(s.failSend)throw Error('timeout');return s.response},transaction:async id=>({id,wallet_id:q.walletId,caip2:s.providerChain,transaction_hash:hash,user_operation_hash:userOp}),settle:async()=>s.result}
 return {s,d,ops:createBscBridgeOperations(d),q,get store(){return store}}
}
for(const q of quotes){
 const f=fixture(q)
 assert.equal((await f.ops.prepare(q,'approval')).state,'prepared')
 await Promise.all([f.ops.submit(q.id,q,'signature'),f.ops.submit(q.id,q,'signature')])
 assert.equal(f.s.sendCount,1,'Concurrent submissions must call Privy once')
 const saved=await f.ops.read(q.id,q)
 assert.equal(saved.transactionId,'transaction123456');assert.equal(saved.userOperationHash,userOp)
 assert.equal((await f.ops.status(q.id,q)).state,'completed')
 f.s.result={status:'pending'}
 assert.equal((await f.ops.status(q.id,q)).state,'completed','Terminal result cannot regress')
 assert.equal(JSON.stringify(f.store).includes('signature'),false)
}
let f=fixture();await f.ops.prepare(f.q,'approval');await f.ops.cancel(f.q.id,f.q)
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'cancelled');assert.equal(f.s.sendCount,0)
await f.ops.prepare({...f.q,id:randomUUID()},'approval')
f=fixture();f.s.approve=false;await assert.rejects(()=>f.ops.prepare(f.q,'bad'),/PIN/);assert.equal(f.store,undefined)
f=fixture();await f.ops.prepare(f.q,'approval');f.s.preflight=false;await assert.rejects(()=>f.ops.submit(f.q.id,f.q,'signature'),/balance/);assert.equal((await f.ops.read(f.q.id,f.q)).state,'prepared');assert.equal(f.s.sendCount,0)
f=fixture();await f.ops.prepare(f.q,'approval');f.s.failSend=true
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'pending')
f.s.now+=86400000
assert.equal((await f.ops.cancel(f.q.id,f.q)).state,'pending')
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'pending');assert.equal(f.s.sendCount,1)
assert.equal((await f.ops.status(f.q.id,f.q)).state,'pending')
assert.equal((await f.ops.list(f.q)).length,1)
for(const edit of [{ownerId:'different'},{walletId:'differentwallet'},{walletAddress:'0x'+'2'.repeat(40)}])assert.deepEqual(await f.ops.list({...f.q,...edit}),[])
f.s.now=f.q.issuedAt;await assert.rejects(()=>f.ops.prepare({...f.q,id:randomUUID()},'approval'),/previous bridge/)
for(const edit of [{ownerId:'different'},{walletId:'differentwallet'},{walletAddress:'0x'+'2'.repeat(40)}])await assert.rejects(()=>f.ops.status(f.q.id,{...f.q,...edit}))
f=fixture();await f.ops.prepare(f.q,'approval');f.s.response.body.data.hash=''
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'pending')
f.s.providerChain='eip155:196';await assert.rejects(()=>f.ops.status(f.q.id,f.q),/verified/)
f.s.providerChain='eip155:56';assert.equal((await f.ops.status(f.q.id,f.q)).state,'completed')
f=fixture();await f.ops.prepare(f.q,'approval');f.s.response={ok:false,status:400,body:{code:'transaction_broadcast_failure'}}
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'not_submitted')
await f.ops.prepare({...f.q,id:randomUUID()},'approval')
f=fixture();await f.ops.prepare(f.q,'approval');f.s.response={ok:false,status:503,body:{code:'unknown'}}
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'pending')
f=fixture();await f.ops.prepare(f.q,'approval');await f.ops.submit(f.q.id,f.q,'signature');f.s.result={status:'completed',amountOutUnits:'1'}
await assert.rejects(()=>f.ops.status(f.q.id,f.q),/verified/)
assert.equal((await f.ops.read(f.q.id,f.q)).state,'pending')
// Cancellation wins if it happens during the final balance/fee preflight.
f=fixture();await f.ops.prepare(f.q,'approval')
let release,entered
const enteredPromise=new Promise(resolve=>entered=resolve)
f.d.preflight=async()=>{entered();await new Promise(resolve=>release=resolve)}
const pendingSubmit=f.ops.submit(f.q.id,f.q,'signature')
await enteredPromise;await f.ops.cancel(f.q.id,f.q);release()
assert.equal((await pendingSubmit).state,'cancelled');assert.equal(f.s.sendCount,0)
// A failed durable reservation must prevent the upstream request altogether.
f=fixture();await f.ops.prepare(f.q,'approval');f.d.mutate=async()=>{throw Error('database unavailable')}
await assert.rejects(()=>f.ops.submit(f.q.id,f.q,'signature'));assert.equal(f.s.sendCount,0)
// Losing the response persistence after broadcasting cannot cause a resend.
f=fixture();await f.ops.prepare(f.q,'approval')
const mutate=f.d.mutate;let writes=0
f.d.mutate=async fn=>{if(++writes===2)throw Error('write lost');return mutate(fn)}
await assert.rejects(()=>f.ops.submit(f.q.id,f.q,'signature'))
assert.equal((await f.ops.read(f.q.id,f.q)).state,'submitting')
assert.equal((await f.ops.submit(f.q.id,f.q,'signature')).state,'submitting');assert.equal(f.s.sendCount,1)
console.log('PASS BSC bridge operations: USDC and USDT bridge, concurrent single submission, pre-sign cancellation, rejected approval, fee/balance preflight, lost response, indefinite unknown recovery, wallet/chain binding, provider IDs and terminal monotonicity; fixtures only')

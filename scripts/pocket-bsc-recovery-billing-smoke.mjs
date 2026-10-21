import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createBscBillingSnapshots,BSC_BILLING_MAX_AGE_MS} from '../api/pocket/bsc-billing-snapshot.ts'
import {recoverBscUserOperation,findBscUserOperation} from '../api/pocket/bsc-user-operation.ts'
import {XLAYER_ENTRY_POINT} from '../api/pocket/xlayer-sponsored-cost.ts'
import {createBscOperations} from '../api/pocket/bsc-operations.ts'
const hash='0x'+'a'.repeat(64),userOp='0x'+'b'.repeat(64),wallet='0x'+'1'.repeat(40)
const binding={transactionId:'transaction123456',walletId:'walletfixture123',chainId:56,hash}
let now=1000000,snapshot,reads=0,missing=false,wrong=false,failWrite=false,cost='0.01'
const deps={now:()=>now,read:async()=>structuredClone(snapshot),write:async(_,v)=>{if(failWrite)throw Error('storage unavailable');snapshot=structuredClone(v)},transaction:async id=>{reads++;return {id,wallet_id:wrong?'otherwallet123':binding.walletId,caip2:'eip155:56',transaction_hash:hash,sponsored:true,gas_credits_charged:missing?null:{currency:'usd',value:cost}}}}
let ledger=createBscBillingSnapshots(deps)
await Promise.all([ledger.refresh([binding]),ledger.refresh([binding])]);assert.equal(reads,1)
for(let i=0;i<10;i++)assert.equal(await ledger.read([binding]),10000n)
assert.equal(reads,1,'Confirmation reads durable evidence without provider history requests')
ledger=createBscBillingSnapshots(deps);assert.equal(await ledger.read([binding]),10000n,'Survives process restart')
await assert.rejects(()=>ledger.read([binding,binding]));assert.equal(reads,1)
await assert.rejects(()=>ledger.read([{...binding,walletId:'otherwallet123'}]));await new Promise(r=>setTimeout(r,0));assert.equal(snapshot.valid,false)
wrong=false;await ledger.refresh([binding]);now+=BSC_BILLING_MAX_AGE_MS;missing=true
await assert.rejects(()=>ledger.read([binding]),/verified/);await new Promise(r=>setTimeout(r,0));assert.equal(snapshot.valid,false)
missing=false;cost='0.02';await ledger.refresh([binding]);assert.equal(await ledger.read([binding]),20000n,'Changed provider bill replaces previous cost')
wrong=true;await assert.rejects(()=>ledger.refresh([binding]));assert.equal(snapshot.valid,false)
wrong=false;failWrite=true;await assert.rejects(()=>ledger.refresh([binding]));failWrite=false
await ledger.refresh([binding]);now--;await assert.rejects(()=>ledger.read([binding]),/verified/);await new Promise(r=>setTimeout(r,0))
console.log('PASS durable billing: request dedupe, restart reuse, zero history calls during confirmation, stale/missing/wrong-wallet bills fail closed, updated cost and persistence failure')

const receipt={userOpHash:userOp,sender:wallet,entryPoint:XLAYER_ENTRY_POINT,receipt:{transactionHash:hash,to:XLAYER_ENTRY_POINT}}
assert.equal(await recoverBscUserOperation(async method=>method==='eth_chainId'?'0x38':receipt,userOp,wallet),hash)
assert.equal(await recoverBscUserOperation(async method=>method==='eth_chainId'?'0x38':null,userOp,wallet),null)
for(const changed of [{...receipt,sender:'0x'+'2'.repeat(40)},{...receipt,userOpHash:hash},{...receipt,entryPoint:wallet},{...receipt,receipt:{...receipt.receipt,to:wallet}}])await assert.rejects(()=>recoverBscUserOperation(async method=>method==='eth_chainId'?'0x38':changed,userOp,wallet))
await assert.rejects(()=>recoverBscUserOperation(async()=> '0xc4',userOp,wallet))
const q=JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json','utf8')).find(q=>q.from!=='BNB')
let store,sends=0,settlement='pending',noIdentifiers=false,discoveryCalls=0
const d={appId:'fixtureappid',now:()=>q.issuedAt+1000,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store))},approve:async()=>true,preflight:async()=>{},send:async()=>{sends++;return {ok:true,status:200,body:{data:{caip2:'eip155:56',...(noIdentifiers?{}:{user_operation_hash:userOp})}}}},transaction:async()=>{throw Error('provider unavailable')},userOperation:async(op,w)=>{assert.equal(op,userOp);assert.equal(w,q.walletAddress);discoveryCalls++;return hash},settle:async()=>({status:settlement,amountOutUnits:q.expectedOutUnits})}
let ops=createBscOperations(d);await ops.prepare(q,'pin');await ops.submit(q.id,q,'signature')
assert.equal(store.operations[q.id].hash,undefined)
await ops.status(q.id,q);assert.equal(store.operations[q.id].hash,undefined,'Unfinalized discovery is not persisted')
settlement='completed';ops=createBscOperations(d)
assert.equal((await ops.status(q.id,q)).state,'completed');assert.equal(store.operations[q.id].hash,hash);assert.equal(sends,1)
await ops.submit(q.id,q,'signature');assert.equal(sends,1)
store=undefined;noIdentifiers=true;ops=createBscOperations(d);await ops.prepare(q,'pin');await ops.submit(q.id,q,'signature');d.now=()=>q.issuedAt+200000
assert.equal((await ops.status(q.id,q)).state,'pending');assert.ok(store.operations[q.id].recoveryRequiredAt);const before=sends;await ops.submit(q.id,q,'signature');assert.equal(sends,before)
console.log('PASS user-operation recovery: wallet/chain/entrypoint binding, exact settlement before hash persistence, restart recovery, manual-review flag and never resend')
const log={address:XLAYER_ENTRY_POINT,topics:['event',userOp,'0x'+wallet.slice(2).padStart(64,'0')],transactionHash:hash,blockNumber:'0x100'}
const rpc=async(method,params)=>{if(method==='eth_chainId')return '0x38';if(method==='eth_blockNumber')return '0x2000';assert.equal(params[0].toBlock,'0x4e7');return [log]}
assert.equal((await findBscUserOperation(rpc,userOp,wallet,'0x100')).hash,hash)
assert.deepEqual(await findBscUserOperation(async(method,p)=>method==='eth_getLogs'?[]:rpc(method,p),userOp,wallet,'0x100'),{hash:null,nextBlock:'0x4e8'})
await assert.rejects(()=>findBscUserOperation(async(method,p)=>method==='eth_getLogs'?[{...log,removed:true}]:rpc(method,p),userOp,wallet,'0x100'))
store=undefined;noIdentifiers=false;d.now=()=>q.issuedAt+1000;d.blockNumber=async()=> '0x100';d.userOperation=async()=>null;d.findUserOperation=async()=>({hash});settlement='completed';ops=createBscOperations(d)
await ops.prepare(q,'pin');await ops.submit(q.id,q,'signature');assert.equal(store.operations[q.id].recoveryBlock,'0x100');assert.equal((await ops.status(q.id,q)).state,'completed')
console.log('PASS on-chain fallback: bounded finalized log scan, removed-log rejection, durable pre-send anchor and no rebroadcast')

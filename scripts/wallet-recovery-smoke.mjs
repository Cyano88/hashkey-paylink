import assert from 'node:assert/strict'
import {commitRecovery,recoveryRange,solanaRecoveryPage,recoveryKey} from '../api/pocket/wallet-activity-recovery.ts'
const signal=new AbortController().signal
let cursor={version:1,next:'100'},saved=[],failSave=false,failCommit=false
const deps={persist:async rows=>{if(failSave)throw Error('save failed');saved.push(...rows)},mutate:async fn=>{if(failCommit)throw Error('commit failed');cursor=fn(cursor)}}
const prior=structuredClone(cursor),next={version:1,next:'580'},row={eventId:'proof'}
failSave=true;await assert.rejects(commitRecovery(prior,next,[row],deps,signal));assert.deepEqual(cursor,prior)
failSave=false;failCommit=true;await assert.rejects(commitRecovery(prior,next,[row],deps,signal));assert.deepEqual(cursor,prior)
failCommit=false;await commitRecovery(prior,next,[row],deps,signal);assert.equal(cursor.next,'580');assert.equal(saved.length,2,'crash gap replays persisted rows')
await assert.rejects(commitRecovery(prior,{version:1,next:'110'},[],deps,signal),/changed/);assert.equal(cursor.next,'580')
const abort=new AbortController();abort.abort();await assert.rejects(commitRecovery(cursor,next,[],deps,abort.signal));assert.equal(cursor.next,'580')
let start='100';for(let i=0;i<4;i++){const range=recoveryRange(start,2000n);assert.equal(range.from,BigInt(start));assert.equal(range.to-range.from+1n, i===3?461n:480n);start=String(range.to+1n)}assert.equal(start,'2001');assert.equal(recoveryRange(start,2000n),null)
assert.deepEqual(recoveryRange(undefined,1000n),{from:881n,to:1000n})
let state={version:1,head:'old'};state=solanaRecoveryPage(state,['new','b','c','d','e'],5);assert.equal(state.head,'old');assert.equal(state.before,'e')
state=solanaRecoveryPage(structuredClone(state),['f','g','h','i','j'],5);assert.equal(state.before,'j');assert.equal(state.cycleHead,'new')
state=solanaRecoveryPage(state,['k'],5);assert.deepEqual(state,{version:1,head:'new'})
assert.throws(()=>solanaRecoveryPage({version:1,head:'old',before:'x'},['x'],5),/Repeated/)
assert.notEqual(recoveryKey('a','base','0xAA'),recoveryKey('b','base','0xAA'));assert.equal(recoveryKey('a','base','0xAA'),recoveryKey('a','base','0xaa'));assert.notEqual(recoveryKey('a','solana','AA'),recoveryKey('a','solana','aa'))
console.log('PASS persistent cursor replay, storage/abort failure, replica CAS, bounded contiguous catch-up, Solana multi-page restart and owner/network isolation')

// Recovery readers verify the actual upstream chain before accepting history.
const {createReadService}=await import('../api/evm-read.ts')
process.env.PRIVATE_RPC_URL='https://fixture.invalid'
let calls=0
const wrongChain=createReadService(async()=>{calls++;return Response.json({result:'0x1'})},Date.now,{verifyChain:true})
await assert.rejects(wrongChain('base','eth_getBlockByNumber',['finalized',false]),/chain/);assert.equal(calls,1)
console.log('PASS recovery rejects a wrong-chain provider before reading history')

// An initially empty wallet must not skip a later burst larger than one page.
let empty={version:1,floorSlot:100}
empty=solanaRecoveryPage(empty,[],5);assert.equal(empty.floorSlot,100)
empty=solanaRecoveryPage(empty,['n10','n9','n8','n7','n6'],5);assert.equal(empty.before,'n6');assert.equal(empty.head,undefined)
empty=solanaRecoveryPage(empty,['n5','n4','n3','n2','n1'],5);assert.equal(empty.before,'n1');assert.equal(empty.cycleHead,'n10')
empty=solanaRecoveryPage(empty,[],5,true);assert.equal(empty.head,'n10');assert.equal(empty.floorSlot,100);assert.equal(empty.before,undefined)
console.log('PASS empty-wallet slot baseline preserves multi-page first-deposit catch-up')

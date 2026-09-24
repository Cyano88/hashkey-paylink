import assert from 'node:assert/strict'
import { createArcDisplayBalanceReader } from '../api/pocket/arc-display-balances.ts'
let clock=0,calls=0,running=0,peak=0
const read=createArcDisplayBalanceReader({now:()=>clock,read:async()=>{calls++;running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,2));running--;return 12n}})
const batch=()=>Promise.all(Array.from({length:50},(_,i)=>read('owner','wallet',`token${i}`)))
await Promise.all([batch(),batch()])
assert.equal(calls,50,'concurrent catalogs share RPC reads')
assert.ok(peak<=6,'global RPC concurrency capped')
await batch();assert.equal(calls,50,'rapid repeat uses display cache')
clock=5_001;await batch();assert.equal(calls,100,'expired display balances refreshed')
await read('owner','other-wallet','token0');await read('other-owner','wallet','token0');assert.equal(calls,102,'owners and wallets isolated')
let failures=0
const retry=createArcDisplayBalanceReader({read:async()=>{if(!failures++)throw Error('unavailable');return 0n}})
await assert.rejects(retry('a','b','c'),/unavailable/);assert.equal(await retry('a','b','c'),0n,'errors not cached as zero')
let boundedCalls=0
const bounded=createArcDisplayBalanceReader({maxEntries:2,read:async()=>{boundedCalls++;return 1n}})
await bounded('a','b','1');await bounded('a','b','2');await bounded('a','b','3');await bounded('a','b','1');assert.equal(boundedCalls,4,'cache is bounded')
console.log(JSON.stringify({passed:true,firstTwoConcurrentCatalogsRpcReads:50,immediateRepeatAdditionalReads:0,peakConcurrency:peak}))

let queueClock=0,release,queueReads=0
const queuedReader=createArcDisplayBalanceReader({concurrency:1,now:()=>queueClock,read:async()=>{queueReads++;await new Promise(r=>release=r);return 1n}})
const firstQueued=queuedReader('a','b','first');await new Promise(r=>setTimeout(r,0));const staleQueued=queuedReader('a','b','queued');queueClock=5001;release();await firstQueued;await assert.rejects(staleQueued,/queue expired/);assert.equal(queueReads,1,'stale queued RPC work discarded')
console.log('Stale queued catalog reads are dropped')

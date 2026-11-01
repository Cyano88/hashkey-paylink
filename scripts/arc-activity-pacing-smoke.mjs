import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {createActivityReadPacer} from '../api/pocket/activity-read-pacing.ts'
import {evmActivity} from '../api/pocket/wallet-chain-activity.ts'
const signal=new AbortController().signal,pace=createActivityReadPacer(20)
let active=0,maxActive=0;const starts=[]
await Promise.all(Array.from({length:4},()=>pace(signal,async()=>{starts.push(Date.now());maxActive=Math.max(maxActive,++active);await delay(5);active--;return 1})))
assert.equal(maxActive,1);for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=18)
let release;const held=new Promise(r=>release=r),bounded=createActivityReadPacer(0,2)
const first=bounded(signal,()=>held),cancel=new AbortController();let dispatched=false
const second=bounded(cancel.signal,async()=>{dispatched=true})
const rejected=assert.rejects(second,e=>e.name==='AbortError')
await assert.rejects(bounded(signal,async()=>{}),e=>e.code===-32005)
cancel.abort();release();await first;await rejected;assert.equal(dispatched,false)
await assert.rejects(bounded(signal,async()=>{throw Error('provider failure')}),/provider failure/)
assert.equal(await bounded(signal,async()=>7),7,'failed reads do not poison queue')
const abortDelay=new AbortController(),slow=createActivityReadPacer(1000)
await slow(signal,async()=>{});const waiting=slow(abortDelay.signal,async()=>assert.fail('cancelled wait dispatched'));abortDelay.abort();await assert.rejects(waiting,e=>e.name==='AbortError')
delete process.env.PRIVATE_RPC_URL_ARC_MAINNET
const logs=[];active=0;maxActive=0
await Promise.all([1,2,3].map(i=>evmActivity('arc','0x'+String(i).repeat(40),signal,async(network,method,params)=>{
 if(method==='eth_blockNumber')return '0x1000'
 assert.equal(method,'eth_getLogs');logs.push(params[0]);maxActive=Math.max(maxActive,++active);await delay(2);active--;return []
})))
assert.equal(logs.length,6);assert.equal(maxActive,1)
for(const log of logs)assert.equal(BigInt(log.toBlock)-BigInt(log.fromBlock)+1n,120n)
assert.equal(logs.filter(log=>log.topics[1]===null).length,3)
console.log('PASS bounded public Arc log pacing across wallets, unchanged bidirectional coverage, spacing, cancellation, capacity and error recovery')

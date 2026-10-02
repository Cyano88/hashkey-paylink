import assert from 'node:assert/strict'
import {createActivityLogReader,createFinalizedActivityReader} from '../api/pocket/activity-rpc-budget.ts'
import {createReadService} from '../api/evm-read.ts'
let now=0,calls=[]
const ranges=[{fromBlock:'0x100',toBlock:'0x177'}]
const reader=createActivityLogReader(()=>now)
const read=async range=>{calls.push(range);return [range]}
assert.equal((await reader('base',ranges,read)).length,1)
assert.equal(calls.length,1)
const restricted=async range=>{calls.push(range);if(BigInt(range.toBlock)-BigInt(range.fromBlock)>=10n)throw Object.assign(Error(),{code:-32006});return [range]}
calls=[];const fallback=await reader('arbitrum',ranges,restricted)
assert.equal(calls.length,13);assert.equal(fallback.length,12)
assert.equal(fallback[0].fromBlock,'0x100');assert.equal(fallback.at(-1).toBlock,'0x177')
for(let i=1;i<fallback.length;i++)assert.equal(BigInt(fallback[i].fromBlock),BigInt(fallback[i-1].toBlock)+1n)
calls=[];await reader('arbitrum',ranges,restricted);assert.equal(calls.length,12)
calls=[];await reader('polygon',ranges,read);assert.equal(calls.length,1)
now=600001;calls=[];await reader('arbitrum',ranges,read);assert.equal(calls.length,1)
await assert.rejects(reader('base',ranges,async()=>{throw Object.assign(Error('quota'),{code:-32004})}),/quota/)
let upstream=0
const gateway=createReadService(async()=>{upstream++;return new Response(JSON.stringify({error:{code:-32602,message:'eth_getLogs is limited to a 10 block range'}}))})
process.env.PRIVATE_RPC_URL='https://private.invalid'
await assert.rejects(gateway('base','eth_getLogs',[{address:'0x'+'11'.repeat(20),topics:['0x'+'22'.repeat(32),'0x'+'33'.repeat(32)],...ranges[0]}]),e=>e.code===-32006)
assert.equal(upstream,1,'range rejection must not trigger public fallback')
let fetched=[];const transactions=createFinalizedActivityReader(()=>now,2)
const final={signature:'a',confirmationStatus:'finalized'},confirmed={signature:'b',confirmationStatus:'confirmed'},missing={signature:'c',confirmationStatus:'finalized'}
const load=async keys=>{fetched.push(keys);return keys.map(key=>key==='c'?null:{signature:key})}
await transactions('solana',[final,confirmed,missing],load)
await transactions('solana',[final,confirmed,missing],load)
assert.deepEqual(fetched,[['a','b','c'],['b','c']],'reuse final only; confirmed and null must retry')
await transactions('other',[final],load);assert.deepEqual(fetched.at(-1),['a'])
now+=3600001;await transactions('solana',[final],load);assert.deepEqual(fetched.at(-1),['a'])
await assert.rejects(transactions('bad',[final],async()=>[]),/Incomplete/)
console.log('PASS: compact log scans, exact fallback coverage, learned capability expiry, quota isolation, finalized-only Solana history caching')

const {createRpcUsageCounter}=await import('../api/pocket/rpc-usage.ts')
let clock=0;const reports=[];const count=createRpcUsageCounter(()=>clock,value=>reports.push(value))
count('evm-read','base','eth_getLogs');count('evm-read','base','eth_getLogs');clock=300001;count('solana-read','solana','getTransaction')
assert.deepEqual(reports,[{windowMs:300001,attempts:{'evm-read:base:eth_getLogs':2}}])
console.log('PASS: aggregate usage counters contain only method counts and elapsed time')

import assert from 'node:assert/strict'
import {createStockDisplayReader} from '../api/pocket/okx-display-balances.ts'
const owner='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222'
let now=100000,broken=new Set([owner]),providerCalls=[],rpcCalls=[]
const rpcSnapshot=()=>({source:'rpc',holdings:[],cash:1n,gas:1n,complete:true,blockNumber:BigInt(now),blockHash:'0x'+'1'.repeat(64),observedAt:now,fullScanAt:now})
const reader=createStockDisplayReader(async wallet=>{providerCalls.push(wallet);if(broken.has(wallet))throw Error('Provider failure');return {...rpcSnapshot(),source:'okx',blockNumber:null,blockHash:null}},async(wallet,baseline)=>{rpcCalls.push({wallet,baseline});return rpcSnapshot()},()=>now)
const first=await reader(owner);assert.equal(first.source,'rpc');assert.equal(rpcCalls[0].baseline,undefined)
assert.equal((await reader(other)).source,'okx');assert.equal(rpcCalls.length,1,'one wallet failure must not redirect a healthy wallet to RPC')
now+=31000;await reader(owner);assert.equal(providerCalls.filter(w=>w===owner).length,1);assert.equal(rpcCalls[1].baseline,first)
now+=31000;broken.delete(owner);const healthy=await reader(owner);assert.equal(healthy.source,'okx')
now+=31000;broken.add(owner);await reader(owner,healthy);assert.equal(rpcCalls[2].baseline.source,'rpc');assert.equal(rpcCalls[2].baseline.observedAt,131000);assert.equal(rpcCalls[2].baseline.fullScanAt,131000)
await reader(owner,healthy,undefined,{force:true});assert.equal(rpcCalls.at(-1).baseline,undefined,'explicit fresh verification retains full scan semantics')
const cancelled=new AbortController();cancelled.abort();const before=rpcCalls.length;await assert.rejects(reader(owner,undefined,cancelled.signal));assert.equal(rpcCalls.length,before)
let tries=0;const abortDuring=new AbortController();const abortReader=createStockDisplayReader(async()=>{tries++;abortDuring.abort();throw Error('cancelled')},async()=>{throw Error('Must not fall back after cancellation')},()=>now)
await assert.rejects(abortReader(owner,undefined,abortDuring.signal));await assert.rejects(abortReader(owner));assert.equal(tries,2,'cancellation must not open the provider circuit')
console.log('PASS wallet-isolated outage cooldown, retained RPC baseline across OKX recovery, forced fresh reads and cancellation without fallback fan-out.')

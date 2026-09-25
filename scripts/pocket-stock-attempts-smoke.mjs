import assert from 'node:assert/strict'
import {runStockSubmission,readStockAttempts,readStockPending,settleStockPending,hasStockSubmission} from '../src/pocket/lib/pocketStockSubmission.ts'
const values=new Map();globalThis.localStorage={get length(){return values.size},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};globalThis.window={dispatchEvent:()=>{}}
let sends=0;const key='fixture:wallet',hash='0x'+'1'.repeat(64),hash2='0x'+'2'.repeat(64),details={recipient:'0xrecipient',amount:'1',symbol:'USDC',at:Date.now()};const hooks={onPending:()=>{},onUncertain:()=>{}};
await assert.rejects(runStockSubmission({key,kind:'send',details,...hooks,send:async()=>{sends++;return{hash}},wait:async()=>{throw Error('RPC timeout')}}),e=>e.transactionPending===true)
assert.equal(readStockAttempts(key)[0].status,'pending')
await assert.rejects(runStockSubmission({key,kind:'send',details,...hooks,send:async()=>{throw Error('Must not resubmit')},wait:async()=>{throw Error('RPC timeout')}}),e=>e.transactionPending===true)
await runStockSubmission({key,kind:'send',details:{...details,amount:'2'},...hooks,send:async()=>{sends++;return{hash:hash2}}})
const first=readStockAttempts(key).find(r=>r.hash===hash);settleStockPending(first,true);assert.equal(readStockPending(key).hash,hash2,'Old settlement cannot clear newer pending record')
await runStockSubmission({key,kind:'send',details:{...details,amount:'2'},...hooks,send:async()=>{sends++;throw Error('Must not submit twice')},wait:async()=>({status:'success'})});assert.equal(sends,2);assert.equal(readStockAttempts(key).filter(r=>r.status==='confirmed').length,2);assert.equal(hasStockSubmission(key),false)
let uncertain=false;await assert.rejects(runStockSubmission({key:'unknown',kind:'send',details,...hooks,onUncertain:v=>uncertain=v,send:async()=>{throw Error('Connection lost')}}));assert.equal(uncertain,true);assert.equal(readStockAttempts('unknown')[0].status,'pending')
await assert.rejects(runStockSubmission({key:'cancelled',kind:'send',details,...hooks,send:async()=>{throw Object.assign(Error('Cancelled'),{code:4001})}}));assert.equal(readStockAttempts('cancelled')[0].status,'failed');assert.equal(hasStockSubmission('cancelled'),false)
console.log('PASS XStocks timeout retains pending; new attempts are independent; old receipt cannot clear newer attempt; duplicate reuses hash without signing; unknown broadcast retained; explicit rejection clears lock.')

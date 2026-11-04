import {crossBridgeJournalKey} from '../api/pocket/cross-bridge-reservation.ts'
import assert from 'node:assert/strict'
import {createBscOperationMutator,BSC_OPERATION_KEYS} from '../api/pocket/bsc-operation-store.ts'
const wallet='0x'+'1'.repeat(40),otherWallet='0x'+'2'.repeat(40)
let db=new Map(),queue=Promise.resolve(),updates=0
const transaction=fn=>{const task=queue.then(async()=>{const staged=structuredClone(db),locked=[];const result=await fn({query:async(sql,args)=>{
 if(sql.startsWith('insert'))return {rows:[]}
 if(sql.startsWith('select')){assert.equal(args[0],[crossBridgeJournalKey(),...BSC_OPERATION_KEYS][locked.length]);locked.push(args[0]);return {rows:[{value:structuredClone(staged.get(args[0]))}]}}
 assert.ok(sql.startsWith('update'));assert.deepEqual(locked,[crossBridgeJournalKey(),...BSC_OPERATION_KEYS]);updates++;staged.set(args[0],JSON.parse(args[1]));return {rows:[]}
 }});db=staged;return result});queue=task.then(()=>undefined,()=>undefined);return task}
const mutate=createBscOperationMutator(transaction,()=>1000)
const op=(address=wallet,state='prepared',expiresAt=2000)=>({state,quote:{walletAddress:address,expiresAt}})
const add=(id,value=op())=>s=>{s??={operations:{}};s.operations[id]=value;return s}
const concurrent=await Promise.allSettled(BSC_OPERATION_KEYS.map((key,i)=>mutate(key,add(String(i)))))
assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1)
assert.equal(concurrent.filter(r=>r.status==='rejected'&&r.reason.code==='wallet_action_pending').length,3)
assert.equal(updates,1)
await mutate(BSC_OPERATION_KEYS[1],add('other',op(otherWallet)))
// Existing unresolved rows participate without a migration; expiry cannot release
// a submission. Recovery and cancellation must remain possible during conflicts.
db=new Map([[BSC_OPERATION_KEYS[0],{operations:{old:op(wallet,'pending',1)}}]])
await assert.rejects(()=>mutate(BSC_OPERATION_KEYS[3],add('send')),e=>e.code==='wallet_action_pending')
await mutate(BSC_OPERATION_KEYS[0],s=>{s.operations.old.state='completed';return s})
await mutate(BSC_OPERATION_KEYS[3],add('send'))
db=new Map([[BSC_OPERATION_KEYS[0],{operations:{old:op(wallet,'prepared',999)}}]])
await mutate(BSC_OPERATION_KEYS[3],add('send'))
db=new Map([[BSC_OPERATION_KEYS[0],{operations:{old:{...op(wallet,'prepared',999),hash:'0x'+'a'.repeat(64)}}}]])
await assert.rejects(()=>mutate(BSC_OPERATION_KEYS[3],add('send')),e=>e.code==='wallet_action_pending')
db=new Map([[BSC_OPERATION_KEYS[0],{operations:{old:op(wallet)}}],[BSC_OPERATION_KEYS[1],{operations:{legacy:op(wallet,'pending')}}]])
await assert.rejects(()=>mutate(BSC_OPERATION_KEYS[0],s=>{s.operations.old.state='submitting';return s}),e=>e.code==='wallet_action_pending')
assert.equal(db.get(BSC_OPERATION_KEYS[0]).operations.old.state,'prepared')
await mutate(BSC_OPERATION_KEYS[0],s=>{s.operations.old.state='cancelled';return s})
await assert.rejects(()=>mutate('unrelated:key',add('x')))
console.log('PASS BSC shared reservation: concurrent bridge/swap/payment/send has one winner; all rows locked before writes; legacy pending blocks dispatch, recovery remains available, expiry cannot release signed/submitted evidence. Transaction fixture only.')

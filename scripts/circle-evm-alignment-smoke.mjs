import assert from 'node:assert/strict'
import { replacementBatchRequest, replacementAlignmentRequest, replacementAlignmentRef, inspectEvmReplacement, prepareEvmReplacement, canAlignReplacementInventory } from '../src/lib/circleEvmReplacement.ts'
const id='22222222-2222-4222-8222-222222222222', a='0x1111111111111111111111111111111111111111', b='0x2222222222222222222222222222222222222222'
const body=replacementBatchRequest(id)
const original=body.blockchains.map((blockchain,i)=>({id:'original-'+i,blockchain,address:i===0?a:b,accountType:'SCA',state:'LIVE',scaCore:'circle_6900_singleowner_v4',refId:body.metadata[i].refId}))
const request=replacementAlignmentRequest(original,id)
assert.deepEqual(request.blockchains,['ARB','ARC']);assert.equal(request.scaConfiguration.scaCore,'circle_6900_singleowner_v4');assert.match(request.idempotencyKey,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);assert.notEqual(request.idempotencyKey,id);assert.deepEqual(request,replacementAlignmentRequest(original,id))
const repaired=request.blockchains.map((blockchain,i)=>({...original[i+1],id:'aligned-'+i,address:a,refId:replacementAlignmentRef(id)}))
assert.equal(inspectEvmReplacement([...original,...repaired],id).status,'matching')
const chosen=inspectEvmReplacement([...original,...repaired],id).wallets
assert.equal(chosen.base.id,'original-0');assert.equal(chosen.arbitrum.id,'aligned-0');assert.equal(inspectEvmReplacement(Object.values(chosen),id).status,'matching')
assert.equal(replacementAlignmentRequest([...original,...repaired],id),null)
assert.equal(inspectEvmReplacement([...original,repaired[0]],id).status,'incomplete')
assert.equal(inspectEvmReplacement([...original,...repaired.map(w=>({...w,address:b}))],id).status,'split')
assert.equal(inspectEvmReplacement([...original,{...repaired[0],state:'FROZEN'},repaired[1]],id).status,'invalid')
assert.equal(inspectEvmReplacement([...original,...repaired.map(w=>({...w,scaCore:'circle_6900_singleowner_v3'}))],id).status,'invalid')
assert.equal(replacementAlignmentRequest(original.map(w=>({...w,scaCore:'circle_6900_singleowner_v3'})),id),null)
const inventory=['BASE','BASE','ARB','ARC'].map((blockchain,i)=>({...original[0],id:'active-'+i,refId:undefined,blockchain}))
assert.equal(canAlignReplacementInventory([...inventory,...original]),true)
assert.equal(canAlignReplacementInventory(inventory.slice(1)),false)
assert.equal(canAlignReplacementInventory([...inventory,{...inventory[0],id:'extra'}]),false)
assert.equal(canAlignReplacementInventory(inventory.map((w,i)=>i===0?{...w,accountType:'EOA'}:w)),false)
assert.equal(canAlignReplacementInventory(Array.from({length:50},(_,i)=>({...inventory[0],id:String(i)}))),false)
let aligned=false,creates=0,approvals=0
const io={list:async()=>aligned?[...original,...repaired]:original,create:async()=>{throw Error('Must retain original batch')},align:async()=>{creates++;return{challengeId:'alignment'}},approve:async c=>{assert.equal(c,'alignment');approvals++;aligned=true}}
assert.equal((await prepareEvmReplacement(id,io)).status,'matching')
assert.equal((await prepareEvmReplacement(id,io)).status,'matching');assert.equal(creates,1);assert.equal(approvals,1)
const failed=[...original,...repaired.map(w=>({...w,address:b}))]
assert.equal((await prepareEvmReplacement(id,{...io,list:async()=>failed,align:async()=>{throw Error('Do not retry a failed alignment')}})).status,'split')
await assert.rejects(prepareEvmReplacement(id,{...io,list:async()=>original,approve:async()=>{throw Error('cancelled')}}),/cancelled/)
console.log('PASS bounded alignment: exact chain scope, stable idempotency, verified matching selection, partial/frozen/version rejection, history guard, cancellation, and no repeat creation.')
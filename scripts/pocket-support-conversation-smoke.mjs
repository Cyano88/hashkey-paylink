import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { submitSupportConversation } from '../api/pocket/support-conversation.ts'
import { advancePocketSupportLifecycle } from '../api/pocket/support-case-lifecycle.ts'
const uuid=()=>crypto.randomUUID()
const cases={}
const send=(overrides={})=>submitSupportConversation(cases,{profileId:'a',message:'Deposit',requestId:uuid(),...overrides},100000,uuid)
const first=send()
assert.equal(first.messages.length,2)
const retryId=first.messages[0].requestId
assert.equal(send({requestId:retryId}).messages.length,2)
assert.throws(()=>send({profileId:'b',caseId:first.id}),e=>e.status===404)
const handoff=send({message:'My payment has not arrived'})
assert.equal(handoff.humanSupport,true)
assert.equal(handoff.messages.length,4)
send({message:'hello'})
assert.equal(handoff.messages.length,5,'No bot reply after handoff')
handoff.status='resolved'
assert.throws(()=>send({caseId:handoff.id}),e=>e.status===409)
const next=send()
assert.notEqual(next.id,first.id)
assert.equal(cases[first.id].status,'resolved')
next.assignedTo='private-staff-address'
const prior=next.messages.length
send({caseId:next.id,message:'Hello'})
assert.equal(next.messages.length,prior+1)
assert.throws(()=>send({message:'x'.repeat(1501)}),e=>e.status===400)
assert.throws(()=>send({requestId:'short'}),e=>e.status===400)
const busy={...next,id:'busy',messages:Array.from({length:10},(_,i)=>({id:String(i),author:'user',text:'hello',createdAt:100000})),profileId:'limit'}
assert.throws(()=>submitSupportConversation({busy},{profileId:'limit',message:'Hi',requestId:uuid()},100001,uuid),e=>e.status===429)
const long={...next,id:'long',profileId:'long',assignedTo:undefined,humanSupport:false,messages:Array.from({length:90},(_,i)=>({id:String(i),author:'user',text:'old',createdAt:1}))}
submitSupportConversation({long},{profileId:'long',message:'Deposit',requestId:uuid()},100000,uuid)
assert.equal(long.messages.length,92,'Durable history is not truncated')
long.status='waiting_user';long.updatedAt=1;long.waitingSince=1
advancePocketSupportLifecycle({long},80*3600000,uuid)
assert.equal(long.messages.length,93)
console.log('Support ownership, retries, handoff, closed cases, rate limits and durable history passed.')



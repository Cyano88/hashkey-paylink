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

const legacy={...next,id:'legacy',profileId:'legacy',category:'bank_payment',assignedTo:undefined,humanSupport:undefined,messages:[{id:'report',author:'agent',kind:'transaction_report',text:'Recorded status: successful',createdAt:1}]}
submitSupportConversation({legacy},{profileId:'legacy',message:'Hi',requestId:uuid()},100000,uuid)
assert.equal(legacy.humanSupport,true)
assert.match(legacy.messages.at(-1).text,/queue for Pocket Support/)
assert.ok(!legacy.messages.some(m=>/How can I help/.test(m.text)))
submitSupportConversation({legacy},{profileId:'legacy',message:'I need to speak to a customer representative',requestId:uuid()},100001,uuid)
assert.match(legacy.messages.at(-1).text,/queue for Pocket Support/)
legacy.assignedTo='staff'
const count=legacy.messages.length
submitSupportConversation({legacy},{profileId:'legacy',message:'I need to speak to a customer representative',requestId:uuid()},100002,uuid)
assert.equal(legacy.messages.length,count+1,'No automatic replies when a staff member owns the case')
const fresh={}
const representative=submitSupportConversation(fresh,{profileId:'new',message:'I need to speak to a customer representative',requestId:uuid()},100000,uuid)
assert.equal(representative.humanSupport,true)
assert.match(representative.messages.at(-1).text,/queue for Pocket Support/)
console.log('Legacy report handoff and explicit customer representative requests passed.')

const separateStore={legacy:structuredClone(legacy)}
const oldSnapshot=JSON.stringify(separateStore.legacy)
const freshRequest=uuid()
const freshInput={profileId:'legacy',message:'Hi',requestId:freshRequest,newConversation:true}
const separate=submitSupportConversation(separateStore,freshInput,200000,uuid)
assert.notEqual(separate.id,legacy.id)
assert.equal(separate.humanSupport,false)
assert.equal(JSON.stringify(separateStore.legacy),oldSnapshot,'Existing human case stays intact')
assert.equal(submitSupportConversation(separateStore,freshInput,200001,uuid).id,separate.id)
assert.equal(Object.keys(separateStore).length,2,'New conversation retries do not duplicate cases')
const oldCount=separateStore.legacy.messages.length
submitSupportConversation(separateStore,{...freshInput,caseId:legacy.id,requestId:uuid()},200002,uuid)
assert.equal(separateStore.legacy.messages.length,oldCount+1,'Explicit case still takes precedence')
assert.throws(()=>submitSupportConversation(separateStore,{...freshInput,profileId:'other',caseId:legacy.id,requestId:uuid()},200003,uuid),e=>e.status===404)
console.log('Fresh conversations preserve human cases, retry identity and ownership.')

assert.equal(separate.status,'waiting_user','A completed AI answer starts the customer-reply countdown')
assert.equal(separate.waitingSince,200000)
const resumed=submitSupportConversation(separateStore,{profileId:'legacy',caseId:separate.id,message:'Hello',requestId:uuid()},250000,uuid)
assert.equal(resumed.status,'waiting_user')
assert.equal(resumed.waitingSince,250000,'A new customer exchange resets the countdown')
submitSupportConversation(separateStore,{profileId:'legacy',caseId:separate.id,message:'I need a human',requestId:uuid()},260000,uuid)
assert.equal(separate.status,'open')
assert.equal(separate.waitingSince,undefined,'Human handoff stops automatic closure')

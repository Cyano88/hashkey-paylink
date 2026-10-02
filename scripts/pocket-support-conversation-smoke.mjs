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
const clarification=send({message:'My payment has not arrived'})
assert.equal(clarification.humanSupport,false);assert.ok(clarification.messages.at(-1).options.length)
const handoff=send({message:'Talk to an agent'})
assert.equal(handoff.humanSupport,true)
assert.equal(handoff.messages.length,7)
send({message:'hello'})
assert.equal(handoff.messages.length,8,'No bot reply after handoff')
assert.ok(handoff.messages[3].options.length)
assert.equal(handoff.messages[6].kind,'handoff')
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

const profileCases={}
const profileAnswer=submitSupportConversation(profileCases,{profileId:'profile-fixture',message:'What are my full names?',requestId:uuid()},100000,uuid)
assert.equal(profileAnswer.humanSupport,false)
assert.equal(profileAnswer.status,'waiting_user')
assert.equal(profileAnswer.messages.at(-1).text,'You can view your full name in Profile.')
submitSupportConversation(profileCases,{profileId:'profile-fixture',caseId:profileAnswer.id,message:'Hello',requestId:uuid()},100001,uuid)
assert.equal(profileAnswer.messages.at(-1).author,'agent')
console.log('Profile guidance avoids unnecessary handoff and preserves conversation.')

for(const question of ["What's my fulll name's", "What's my full name?", "What are my full names?"]){const records={};const answer=submitSupportConversation(records,{profileId:'typo-fixture',message:question,requestId:uuid()},100000,uuid);assert.equal(answer.humanSupport,false);assert.equal(answer.messages.at(-1).text,'You can view your full name in Profile.')}
const contextCases={};const contextInput={profileId:'context-fixture',newConversation:true,message:'Last payment',requestId:uuid()};
const selected=submitSupportConversation(contextCases,contextInput,100000,uuid,{tenantId:'pocket',entries:{},accountAnswer:{text:'Saved payment.',handoff:false,accountContext:{kind:'payment',readAt:100000,transaction:{eventId:'owned',chain:'base',txHash:'owned-hash'}},receipt:{eventId:'owned'}}});
submitSupportConversation(contextCases,{...contextInput,caseId:selected.id,newConversation:false,optionId:'gifts',message:'Gifts & requests',requestId:uuid()},100001,uuid);
assert.equal(selected.messages.at(-1).accountContext.kind,'clarify');assert.equal(selected.messages.at(-1).accountContext.transaction,undefined);
console.log('PASS topic changes clear selected-payment context')
import {pocketSupportAnswer} from '../src/pocket/lib/pocketSupportContent.ts'
for(const question of ['Can I trust pocket with my money?','I want to be sure if my money is safe with pocket by hash paylink','How does Pocket protect my funds?']){
 const answer=pocketSupportAnswer(question);assert.equal(answer.handoff,false);assert.equal(answer.unresolved,undefined);assert.match(answer.text,/PIN and optional biometrics/);assert.match(answer.text,/no app can guarantee/);assert.deepEqual(answer.options.map(x=>x.id),['security','human'])
}
assert.equal(pocketSupportAnswer('My money was stolen, is Pocket safe?').handoff,true)
console.log('PASS trust questions explain safeguards without guarantees, with human review for security incidents')

import assert from 'node:assert/strict'
import {createKnowledge,reviewKnowledge,findApprovedKnowledge,validateKnowledge} from '../api/hash-support/knowledge.ts'
import {submitSupportConversation} from '../api/pocket/support-conversation.ts'
let seq=0;const uuid=()=>`test-${String(++seq).padStart(20,'0')}`;const now=100000;const store={}
const draft=createKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'lesson',sourceCaseId:'resolved-case',question:'Where can receipts be downloaded?',answer:'Open the transaction in Activity, then choose View receipt.',privateValues:[]},now)
assert.equal(findApprovedKnowledge(store,'pocket',draft.question,now),undefined)
assert.throws(()=>reviewKnowledge(store,{tenantId:'another-business',actorId:'staff',id:'lesson',version:1,action:'approve',reviewConfirmed:true},now),e=>e.status===404)
assert.throws(()=>reviewKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'lesson',version:1,action:'approve'},now),e=>e.status===400)
reviewKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'lesson',version:1,action:'approve',reviewConfirmed:true},now)
assert.equal(findApprovedKnowledge(store,'pocket','Where can receipts be downloaded?',now).id,'lesson')
assert.equal(findApprovedKnowledge(store,'another-business',draft.question,now),undefined)
assert.equal(findApprovedKnowledge(store,'pocket',draft.question,draft.expiresAt),undefined)
assert.throws(()=>reviewKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'lesson',version:1,action:'retire'},now),e=>e.status===409)
createKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'duplicate',sourceCaseId:'resolved-case',question:draft.question,answer:draft.answer},now)
assert.throws(()=>reviewKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'duplicate',version:1,action:'approve',reviewConfirmed:true},now),e=>e.status===409)
for(const answer of ['Contact sample@example.test','Wallet 0x'+'1'.repeat(40),'Use 12345678901','Bearer abc123','Your payment has arrived.'])assert.throws(()=>validateKnowledge('How can this be fixed?',answer))
assert.throws(()=>validateKnowledge('How can this be fixed?','Ask Sample Customer for more information',['Sample Customer']))
const cases={};const first=submitSupportConversation(cases,{profileId:'user',message:draft.question,requestId:uuid()},now,uuid,{tenantId:'pocket',entries:store})
assert.equal(first.messages.at(-1).text,draft.answer);assert.equal(first.messages.at(-1).knowledgeId,'lesson');assert.equal(first.humanSupport,false)
const handoff=submitSupportConversation(cases,{profileId:'user',message:'Talk to support',requestId:uuid()},now,uuid,{tenantId:'pocket',entries:store});assert.equal(handoff.humanSupport,true)
const count=handoff.messages.length;submitSupportConversation(cases,{profileId:'user',message:draft.question,requestId:uuid()},now,uuid,{tenantId:'pocket',entries:store});assert.equal(handoff.messages.length,count+1,'No memory answers after human handoff')
const risky={...draft,id:'risky',question:'My transfer is stuck'};store.risky=risky;assert.equal(findApprovedKnowledge(store,'pocket',risky.question,now),undefined)
reviewKnowledge(store,{tenantId:'pocket',actorId:'staff',id:'lesson',version:2,action:'retire'},now);assert.equal(findApprovedKnowledge(store,'pocket',draft.question,now),undefined)
console.log('PASS draft/review/withdrawal, tenant isolation, explicit review, stale versions, expiry, duplicate approvals, sensitive data screening, answer provenance and human handoff priority.')

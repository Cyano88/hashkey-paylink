import assert from 'node:assert/strict'
import {advancePocketSupportLifecycle,requestSupportResolution,answerSupportResolution,SUPPORT_RESOLUTION_AFTER_MS} from '../api/pocket/support-case-lifecycle.ts'
let n=0;const uuid=()=>String(++n)
const make=()=>({status:'assigned',priority:'normal',assignedTo:'staff',messages:[],updatedAt:1000})
const a=make();requestSupportResolution(a,1000,uuid);const prompt=a.resolutionPromptId
assert.equal(a.status,'waiting_user');requestSupportResolution(a,2000,uuid);assert.equal(a.messages.length,1)
assert.throws(()=>answerSupportResolution(a,'wrong','no',2000,uuid),e=>e.status===409)
answerSupportResolution(a,prompt,'yes',2000,uuid);assert.equal(a.status,'assigned');assert.equal(a.assignedTo,'staff');assert.equal(a.resolutionRequestedAt,undefined)
requestSupportResolution(a,3000,uuid);answerSupportResolution(a,a.resolutionPromptId,'no',4000,uuid);assert.equal(a.status,'resolved')
assert.throws(()=>answerSupportResolution(a,prompt,'yes',5000,uuid),e=>e.status===409)
const b=make();requestSupportResolution(b,1000,uuid);advancePocketSupportLifecycle({b},1000+SUPPORT_RESOLUTION_AFTER_MS-1,uuid);assert.notEqual(b.status,'resolved');advancePocketSupportLifecycle({b},1000+SUPPORT_RESOLUTION_AFTER_MS,uuid);assert.equal(b.status,'resolved')
const money={...make(),category:'bank_payment'};requestSupportResolution(money,1000,uuid);advancePocketSupportLifecycle({money},1000+10*SUPPORT_RESOLUTION_AFTER_MS,uuid);assert.equal(money.status,'waiting_user');assert.match(money.messages.at(-1).text,/stay open/)
const queued={...make(),status:'open',assignedTo:undefined,humanSupport:true};advancePocketSupportLifecycle({queued},1000+SUPPORT_RESOLUTION_AFTER_MS,uuid);assert.equal(queued.status,'open');assert.ok(queued.supportEscalatedAt)
console.log('Resolution Yes/No, stale prompts, 24-hour deadline, protected payments and unanswered support escalation passed.')

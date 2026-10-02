import assert from 'node:assert/strict'
import {resolveSupportMatch} from '../api/hash-support/semantic-answer.ts'
import {submitSupportConversation} from '../api/pocket/support-conversation.ts'
const now=Date.now(),entry={id:'approved',tenantId:'pocket',question:'Where are receipts?',answer:'Open Activity.',sourceCaseId:'case',status:'approved',version:2,createdBy:'staff',createdAt:now,updatedAt:now,reviewedBy:'staff',expiresAt:now+60000}
const match={source:'knowledge',id:entry.id,version:2}
assert.equal(resolveSupportMatch(match,{approved:entry},'pocket',now).answer,'Open Activity.')
assert.equal(resolveSupportMatch(match,{approved:{...entry,status:'retired'}},'pocket',now),undefined)
assert.equal(resolveSupportMatch(match,{approved:entry},'other-business',now),undefined)
assert.equal(resolveSupportMatch(match,{approved:entry},'pocket',now+61000),undefined)
assert.equal(resolveSupportMatch({...match,version:1},{approved:entry},'pocket',now),undefined)
const cases={};let n=0
const item=submitSupportConversation(cases,{profileId:'fixture',message:'Where can I download receipts?',requestId:'stale-match-request-001'},now,()=>String(++n),{tenantId:'pocket',entries:{approved:{...entry,status:'retired'}},match})
assert.equal(item.humanSupport,false);assert.ok(item.messages.at(-1).options.length);assert.equal(item.messages.at(-1).knowledgeId,undefined)
console.log('PASS semantic answer revalidation: business scope, version, expiry, withdrawal and clarification fallback')

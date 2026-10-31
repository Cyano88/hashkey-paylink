import assert from 'node:assert/strict'
import {needsSupportReply,needsBusinessReview} from '../src/lib/operationsAttention.ts'
import {withAttentionCounts} from '../api/operations-access.ts'
for(const status of ['not_started','draft','changes_requested','approved','rejected'])assert.equal(needsBusinessReview({verificationStatus:status}),false)
assert.equal(needsBusinessReview({verificationStatus:'submitted'}),true)
assert.equal(needsBusinessReview({accountType:'individual',verificationStatus:'submitted'}),false)
for(const status of ['open','assigned'])assert.equal(needsSupportReply({id:'x',status}),true)
for(const status of ['resolved','waiting_user'])assert.equal(needsSupportReply({id:'x',status}),false)
assert.equal(needsSupportReply({id:'x',status:'open',humanSupport:false}),false)
assert.equal(needsSupportReply({id:'x',status:'assigned',escalation:{status:'pending',destination:'legal'}}),false)
const workspace=(id,manage=true)=>({id,projectIds:['app'],sections:['cases'],permissions:{manageCases:manage},integrations:[{id:'app'}]})
const cases={a:{id:'a',workspaceId:'one',projectId:'app',status:'open'},b:{id:'b',workspaceId:'other',projectId:'app',status:'open'},c:{id:'c',workspaceId:'one',projectId:'foreign',status:'open'},d:{id:'d',workspaceId:'one',projectId:'app',status:'waiting_user'}}
const result=withAttentionCounts({workspaces:[workspace('one'),workspace('restricted',false),workspace('builders'),{...workspace('pocket'),sections:['support']}]},cases,{p:{id:'p',status:'assigned'}})
assert.deepEqual(result.workspaces.map(w=>w.supportPending),[1,0,0,1])
assert.equal(result.workspaces[0].integrations[0].supportPending,1)
assert.equal(withAttentionCounts({workspaces:[workspace('one')]},{...cases,a:{...cases.a,status:'resolved'}},{}).workspaces[0].supportPending,0)
console.log('Operations attention counts: statuses, workspace isolation, role isolation, and resolution passed.')

assert.equal(withAttentionCounts({workspaces:[workspace('one')]},null,{}).workspaces[0].supportPending,undefined)

const reviewCases={
 c:{id:'c',workspaceId:'one',projectId:'app',status:'assigned',escalation:{status:'pending',destination:'compliance'}},
 l:{id:'l',workspaceId:'one',projectId:'app',status:'assigned',escalation:{status:'pending',destination:'legal'}},
 r:{id:'r',workspaceId:'one',projectId:'app',status:'resolved',escalation:{status:'pending',destination:'compliance'}},
 foreign:{id:'foreign',workspaceId:'other',projectId:'app',status:'assigned',escalation:{status:'pending',destination:'compliance'}}
}
assert.equal(withAttentionCounts({workspaces:[workspace('one')]},reviewCases,{}).workspaces[0].reviewPending,2)
assert.equal(withAttentionCounts({workspaces:[{...workspace('one',false),roles:['compliance']}]},reviewCases,{}).workspaces[0].reviewPending,1)
assert.equal(withAttentionCounts({workspaces:[{...workspace('one',false),roles:['legal']}]},reviewCases,{}).workspaces[0].reviewPending,1)
assert.equal(withAttentionCounts({workspaces:[{...workspace('one',false),roles:[]}]},reviewCases,{}).workspaces[0].reviewPending,0)
console.log('PASS: specialist review counts isolate destination, workspace and resolved cases.')

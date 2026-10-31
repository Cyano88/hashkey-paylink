import assert from 'node:assert/strict'
import {createOperationsCasesHandler} from '../api/operations-cases.ts'
import {authorizeOperations,operationsPolicy} from '../api/operations-policy.ts'
import {operationsSession} from '../api/operations-access.ts'
import {advancePocketSupportLifecycle,requestSupportResolution,answerSupportResolution} from '../api/pocket/support-case-lifecycle.ts'
const project='dev_aaaaaaaa1111',other='dev_bbbbbbbb2222',owner={userId:'owner',email:'owner@example.test'},support={userId:'support',email:'support@example.test'},compliance={userId:'compliance',email:'compliance@example.test'},legal={userId:'legal',email:'legal@example.test'}
const env={OPERATIONS_FOUNDER_EMAILS:owner.email,OPERATIONS_WORKSPACES_JSON:JSON.stringify([{id:'merchant',name:'Merchant',projectIds:[project]},{id:'other',name:'Other',projectIds:[other]}]),OPERATIONS_GRANTS_JSON:JSON.stringify([{email:support.email,workspaceId:'merchant',roles:['support']},{email:compliance.email,workspaceId:'merchant',roles:['compliance']},{email:legal.email,workspaceId:'merchant',roles:['legal']},{email:support.email,workspaceId:'pocket',roles:['support']},{email:compliance.email,workspaceId:'pocket',roles:['compliance']}])}
let identity=support,now=1000,n=0,storage={cases:{}},checkoutProject=project
const handler=createOperationsCasesHandler({profiles:async()=>undefined,verify:async()=>identity,env:()=>env,now:()=>now++,uuid:()=>String(++n),read:async()=>structuredClone(storage),mutate:async(_w,fn)=>{storage=fn(structuredClone(storage));return storage},checkout:async()=>({partnerId:checkoutProject})})
async function call(body,workspace='merchant'){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};await handler({method:body?'POST':'GET',body,query:{workspace}},res);return res}
const draft={action:'case-create',projectId:project,category:'purchase_complaint',summary:'Customer reports missing purchase',checkoutId:'chk_12345678',orderReference:'order-123',evidence:['https://evidence.example.test/123']}
checkoutProject=other;assert.equal((await call(draft)).statusCode,404);assert.equal(Object.keys(storage.cases).length,0);checkoutProject=project
assert.equal((await call({...draft,evidence:['javascript:alert(1)']})).statusCode,400)
assert.equal((await call({...draft,orderReference:''})).statusCode,400)
let result=await call(draft);assert.equal(result.statusCode,200);let c=result.body.case
assert.equal((await call({action:'case-escalate',caseId:c.id,updatedAt:0,destination:'compliance',reason:'Review identity mismatch'})).statusCode,409)
result=await call({action:'case-escalate',caseId:c.id,updatedAt:c.updatedAt,destination:'compliance',reason:'Review identity mismatch'});assert.equal(result.statusCode,200);c=result.body.case;assert.equal(c.assignedTo,support.email);assert.equal(c.escalation.status,'pending')
assert.equal((await call({action:'case-resolve',caseId:c.id,updatedAt:c.updatedAt,reason:'Mark as resolved anyway'})).statusCode,409)
assert.equal((await call({action:'case-review',caseId:c.id,updatedAt:c.updatedAt,reason:'Unauthorized decision'})).statusCode,403)
identity=legal;assert.equal((await call()).body.cases.length,0);assert.equal((await call({action:'case-review',caseId:c.id,updatedAt:c.updatedAt,reason:'Wrong reviewer decision'})).statusCode,404)
identity=compliance;assert.equal((await call()).body.cases.length,1);assert.equal((await call(undefined,'other')).statusCode,403)
result=await call({action:'case-review',caseId:c.id,updatedAt:c.updatedAt,reason:'Identity checked. Support can follow up.'});assert.equal(result.statusCode,200);c=result.body.case;assert.equal(c.assignedTo,support.email);assert.equal(c.escalation.status,'reviewed');assert.equal(c.caseHistory.length,3)
assert.equal(c.caseHistory[1].destination,'compliance');assert.equal(c.caseHistory[2].destination,'compliance')
identity=support;assert.equal((await call({action:'case-resolve',caseId:c.id,updatedAt:c.updatedAt,reason:'Customer confirmed issue resolved'})).statusCode,200)
const pocket={id:'pocket-case',profileId:'private-owner',customer:{email:'secret@example.test'},status:'waiting_user',priority:'normal',humanSupport:true,summary:'Account mismatch',assignedTo:support.email,messages:[{id:'m',author:'user',text:'Help with account',createdAt:1}],createdAt:1,updatedAt:1,escalation:{destination:'compliance',status:'pending',reason:'Review identity mismatch'}}
storage={cases:{[pocket.id]:pocket}};identity=compliance
const list=await call(undefined,'pocket');assert.equal(list.statusCode,200);assert(!('customer' in list.body.cases[0]));assert(!('profileId' in list.body.cases[0]))
advancePocketSupportLifecycle(storage.cases,400000000,()=>String(++n));assert.equal(storage.cases[pocket.id].status,'waiting_user');assert.throws(()=>requestSupportResolution(pocket,now,()=>''),{status:409});assert.throws(()=>answerSupportResolution({...pocket,resolutionRequestedAt:1,resolutionPromptId:'any'},'any','no',now,()=>''),{status:409})
storage.cases[pocket.id].resolutionRequestedAt=1;storage.cases[pocket.id].resolutionPromptId='old';storage.cases[pocket.id].waitingSince=1
const pocketDecision=await call({action:'case-review',caseId:pocket.id,updatedAt:pocket.updatedAt,reason:'Review complete. Support should follow up.'},'pocket');assert.equal(pocketDecision.statusCode,200);assert.equal(storage.cases[pocket.id].status,'assigned');assert.equal(storage.cases[pocket.id].resolutionRequestedAt,undefined);advancePocketSupportLifecycle(storage.cases,400000000,()=>String(++n));assert.notEqual(storage.cases[pocket.id].status,'resolved')
for(const role of ['administrator','engineering','compliance','legal','support','product']){
 const e={...env,OPERATIONS_GRANTS_JSON:JSON.stringify([{email:support.email,workspaceId:'merchant',roles:[role]}])}
 assert.throws(()=>authorizeOperations(support,{method:'POST',query:{workspace:'merchant'},body:{action:'admin-arc-pilot-approve'}},'projects',project,e),{status:403})
 if(role!=='compliance')for(const action of ['admin-verification-read','admin-verification-download'])assert.throws(()=>authorizeOperations(support,{method:'POST',query:{workspace:'merchant'},body:{action}},'projects',project,e),{status:403})
 if(role!=='compliance')assert.throws(()=>authorizeOperations(support,{method:'POST',query:{workspace:'merchant'},body:{action:'admin-verification-review'}},'projects',project,e),{status:403})
}
const session=operationsSession(owner,[{id:project,name:'Live',environment:'live'},{id:other,name:'Removed',removal:{status:'deleted'}}],env)
assert.deepEqual(session.roles,['owner']);assert(!session.workspaces.some(w=>w.id==='other'));assert(!session.workspaces.some(w=>w.integrations.some(p=>p.id===other)))
console.log('PASS case ownership, cross-business rejection, evidence validation, stale updates, assigned review queues, support cannot decide, retained support ownership, immutable history, Pocket privacy and review prevents auto-close. No payment or message sent.')
import {createOperationsAuditHandler} from '../api/operations-audit.ts'
let auditReads=0
const audit=createOperationsAuditHandler({verify:async()=>identity,env:()=>env,team:async()=>{auditReads++;return {history:[{email:'staff@example.test',roles:['support'],actor:owner.email,at:'2026-10-31T00:00:00Z',workspaceId:'merchant'}]}},business:async()=>({cases:{test:{id:'test',workspaceId:'merchant',caseHistory:[{id:'event',action:'case-escalate',actor:support.email,at:100,text:'PRIVATE INTERNAL NOTE'}]}}}),pocket:async()=>({cases:{}}),projects:async()=>({projects:{[project]:{id:project,name:'Merchant',businessVerification:{history:[{action:'submitted',actor:'app-owner',at:'2026-10-31T00:01:00Z'}]}}}})})
async function auditCall(){const r={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await audit({method:'GET'},r);return r}
identity=support;assert.equal((await auditCall()).statusCode,403);assert.equal(auditReads,0)
identity=owner;const history=await auditCall();assert.equal(history.statusCode,200);assert.equal(history.body.events.length,3);assert(!JSON.stringify(history.body).includes('PRIVATE INTERNAL NOTE'));assert.equal(history.body.events[0].source,'Verification')
console.log('PASS owner-only combined audit, no reads before authorization, chronology and no private case-note payload in index.')

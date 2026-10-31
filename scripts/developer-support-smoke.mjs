import assert from 'node:assert/strict'
import {createDeveloperSupportHandler} from '../api/developer-support.ts'
import {createOperationsCasesHandler} from '../api/operations-cases.ts'
const project='dev_aaaaaaaa1111',other='dev_bbbbbbbb2222';let who='owner-a',store={cases:{}},reads=0,n=0,now=100000
const copy=()=>structuredClone(store),mutate=fn=>(store=fn(copy()))
const handler=createDeveloperSupportHandler({owner:async(_req,id)=>{if(id!==project||who!=='owner-a')throw Object.assign(Error('Project not found.'),{status:404});return {id,ownerId:who,name:'Example app',email:'builder@example.test'}},now:()=>now++,uuid:()=>String(++n),workspace:()=> 'merchant',read:async()=>{reads++;return copy()},mutate:async fn=>mutate(fn)})
async function call(body,query={projectId:project},h=handler){const r={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await h({method:body?'POST':'GET',query,body},r);return r}
who='other-owner';assert.equal((await call()).statusCode,404);assert.equal(reads,0);who='owner-a'
const payload={action:'message',projectId:project,requestId:'request-000000000000001',message:'How do webhooks work?',newConversation:true}
const first=await call(payload);assert.equal(first.statusCode,200);const id=first.body.case.id;assert.equal(first.body.case.messages.length,2);assert.equal(first.body.case.humanSupport,false);assert(!JSON.stringify(first.body).includes('Pocket'));assert.equal((await call(payload)).body.case.messages.length,2)
assert.equal((await call({...payload,caseId:'foreign-case',requestId:'request-000000000000002'})).statusCode,404)
const handoff=await call({...payload,caseId:id,message:'Talk to a person',requestId:'request-000000000000003'});assert.equal(handoff.body.case.humanSupport,true);assert.match(handoff.body.case.messages.at(-1).text,/Business Support/)
store.cases.foreign={...structuredClone(store.cases[id]),id:'foreign',projectId:other,profileId:'owner-a:'+other};store.cases[id].caseHistory=[{text:'PRIVATE STAFF NOTE'}];store.cases[id].escalation={reason:'PRIVATE REVIEW',destination:'compliance',status:'reviewed'}
const listed=await call();assert.equal(listed.body.cases.length,1);assert(!JSON.stringify(listed.body).includes('PRIVATE'));assert(!('profileId' in listed.body.cases[0]));assert(!('customer' in listed.body.cases[0]))
const env={OPERATIONS_FOUNDER_EMAILS:'founder@example.test',OPERATIONS_WORKSPACES_JSON:JSON.stringify([{id:'merchant',name:'Example',projectIds:[project]}]),OPERATIONS_GRANTS_JSON:JSON.stringify([{email:'staff@example.test',workspaceId:'merchant',roles:['support']},{email:'legal@example.test',workspaceId:'merchant',roles:['legal']}])};let staff='staff@example.test'
const admin=createOperationsCasesHandler({verify:async()=>({userId:'staff',email:staff}),env:()=>env,read:async()=>copy(),mutate:async(_w,fn)=>mutate(fn),uuid:()=>String(++n),now:()=>now++})
const reply={action:'case-reply',caseId:id,updatedAt:store.cases[id].updatedAt,reason:'We are checking your checkout reference.'}
staff='legal@example.test';assert.equal((await call(reply,{workspace:'merchant'},admin)).statusCode,403);staff='staff@example.test';assert.equal((await call(reply,{workspace:'merchant'},admin)).statusCode,200);assert.equal((await call(reply,{workspace:'merchant'},admin)).statusCode,409)
const received=await call();assert.equal(received.body.cases[0].messages.at(-1).author,'staff');assert.equal(received.body.cases[0].messages.at(-1).text,reply.reason);assert(!JSON.stringify(received.body).includes('PRIVATE'))
store.cases[id].status='resolved';assert.equal((await call({...payload,caseId:id,requestId:'request-000000000000004'})).statusCode,409)
console.log('PASS owner/project isolation, no pre-auth reads, duplicate-send idempotency, developer-only answers, human handoff, private-note projection, staff-only replies, stale-update rejection and closed-case rejection. Fixtures only; no real message sent.')

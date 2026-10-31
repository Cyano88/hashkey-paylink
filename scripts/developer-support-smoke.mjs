import assert from 'node:assert/strict'
import {createDeveloperSupportHandler} from '../api/developer-support.ts'
import {createOperationsCasesHandler} from '../api/operations-cases.ts'
const project='dev_aaaaaaaa1111',other='dev_bbbbbbbb2222';let who='owner-a',store={cases:{}},reads=0,n=0,now=100000
const copy=()=>structuredClone(store),mutate=fn=>(store=fn(copy()))
const handler=createDeveloperSupportHandler({profiles:async()=>undefined,identity:async()=>({userId:who,email:who+'@example.test'}),owner:async(_req,id)=>{if(id!==project||who!=='owner-a')throw Object.assign(Error('Project not found.'),{status:404});return {id,ownerId:who,name:'Example app',email:'builder@example.test'}},now:()=>now++,uuid:()=>String(++n),workspace:()=> 'merchant',read:async()=>{reads++;return copy()},mutate:async fn=>mutate(fn)})
async function call(body,query={projectId:project},h=handler){const r={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await h({method:body?'POST':'GET',query,body},r);return r}
who='other-owner';assert.equal((await call()).statusCode,404);assert.equal(reads,0);who='owner-a'
const payload={action:'message',projectId:project,requestId:'request-000000000000001',message:'How do webhooks work?',newConversation:true}
const first=await call(payload);assert.equal(first.statusCode,200);const id=first.body.case.id;assert.equal(first.body.case.messages.length,2);assert.equal(first.body.case.humanSupport,false);assert(!JSON.stringify(first.body).includes('Pocket'));assert.equal((await call(payload)).body.case.messages.length,2)
assert.equal((await call({...payload,caseId:'foreign-case',requestId:'request-000000000000002'})).statusCode,404)
const handoff=await call({...payload,caseId:id,message:'Talk to us',optionId:'human',requestId:'request-000000000000003'});assert.equal(handoff.body.case.humanSupport,true);assert.match(handoff.body.case.messages.at(-1).text,/our team/)
store.cases.foreign={...structuredClone(store.cases[id]),id:'foreign',projectId:other,profileId:'owner-a:'+other};store.cases[id].caseHistory=[{text:'PRIVATE STAFF NOTE'}];store.cases[id].escalation={reason:'PRIVATE REVIEW',destination:'compliance',status:'reviewed'}
const listed=await call();assert.equal(listed.body.cases.length,1);assert(!JSON.stringify(listed.body).includes('PRIVATE'));assert(!('profileId' in listed.body.cases[0]));assert(!('customer' in listed.body.cases[0]))
const env={OPERATIONS_FOUNDER_EMAILS:'founder@example.test',OPERATIONS_WORKSPACES_JSON:JSON.stringify([{id:'merchant',name:'Example',projectIds:[project]}]),OPERATIONS_GRANTS_JSON:JSON.stringify([{email:'staff@example.test',workspaceId:'merchant',roles:['support']},{email:'legal@example.test',workspaceId:'merchant',roles:['legal']}])};let staff='staff@example.test'
const admin=createOperationsCasesHandler({profiles:async()=>undefined,staffProfile:async()=>({displayName:'Sarah',avatarDataUrl:undefined}),verify:async()=>({userId:'staff',email:staff}),env:()=>env,read:async()=>copy(),mutate:async(_w,fn)=>mutate(fn),uuid:()=>String(++n),now:()=>now++})
const reply={action:'case-reply',caseId:id,updatedAt:store.cases[id].updatedAt,reason:'We are checking your checkout reference.'}
staff='legal@example.test';assert.equal((await call(reply,{workspace:'merchant'},admin)).statusCode,403);staff='staff@example.test';assert.equal((await call(reply,{workspace:'merchant'},admin)).statusCode,200);assert.equal((await call(reply,{workspace:'merchant'},admin)).statusCode,409)
const received=await call();assert.equal(received.body.cases[0].messages.at(-1).author,'staff');assert.equal(received.body.cases[0].messages.at(-1).text,reply.reason);assert(!JSON.stringify(received.body).includes('PRIVATE'))
store.cases[id].status='resolved';assert.equal((await call({...payload,caseId:id,requestId:'request-000000000000004'})).statusCode,409)
console.log('PASS owner/project isolation, no pre-auth reads, duplicate-send idempotency, developer-only answers, human handoff, private-note projection, staff-only replies, stale-update rejection and closed-case rejection. Fixtures only; no real message sent.')

who='owner-a';const account=await call({...payload,projectId:'',requestId:'request-account-000000001',message:'Talk to us',optionId:'human'},{projectId:''});assert.equal(account.statusCode,200);assert.equal(store.cases[account.body.case.id].workspaceId,'builders');assert.equal(store.cases[account.body.case.id].projectId,undefined);assert.equal((await call(undefined,{projectId:''})).body.cases.length,1);who='owner-b';assert.equal((await call(undefined,{projectId:''})).body.cases.length,0);assert.equal((await call({...payload,projectId:'',caseId:account.body.case.id,requestId:'request-account-000000002'})).statusCode,404);who='owner-a';assert.equal((await call(undefined,{workspace:'builders'},admin)).statusCode,403);
const builderEnv={...env,OPERATIONS_GRANTS_JSON:JSON.stringify([{email:'staff@example.test',workspaceId:'builders',roles:['support']}])};const builderAdmin=createOperationsCasesHandler({profiles:async()=>undefined,staffProfile:async()=>({displayName:'Sarah',avatarDataUrl:undefined}),verify:async()=>({userId:'staff',email:'staff@example.test'}),env:()=>builderEnv,read:async()=>copy(),mutate:async(_w,fn)=>mutate(fn),uuid:()=>String(++n),now:()=>now++});const inbox=await call(undefined,{workspace:'builders'},builderAdmin);assert.equal(inbox.statusCode,200);assert.equal(inbox.body.cases.length,1);assert.equal(inbox.body.cases[0].id,account.body.case.id);
console.log('PASS support before app creation, account/project separation, cross-account rejection and explicit staff access to the developer-account queue.');

// Guided menus preserve free text; only an explicit option hands off.
const guided=await call({...payload,requestId:'guided-request-000001',message:'payment stuck'});const gid=guided.body.case.id;
assert.equal(guided.body.case.humanSupport,false);assert.equal(guided.body.case.supportOptions.length,6);
const follow=await call({...payload,caseId:gid,requestId:'guided-request-000002',message:'My order is 123'});
assert.equal(follow.body.case.messages.filter(m=>m.author==='agent').length,1);
const choose=async(optionId,requestId)=>call({...payload,caseId:gid,optionId,requestId,message:'ignored client label'});
assert.equal((await choose('invented','guided-request-000003')).statusCode,400);
assert.equal((await choose('resolved','guided-request-000004')).statusCode,409);
const topics=await choose('payments','guided-request-000005');assert.equal(topics.body.case.supportOptions[0].id,'processing');
const help=await choose('processing','guided-request-000006');assert.match(help.body.case.messages.at(-1).text,/do not pay again/);
const resolved=await choose('resolved','guided-request-000007');assert.equal(resolved.body.case.status,'resolved');assert.equal(resolved.body.case.messages.at(-1).kind,'automatic_resolution');
assert.equal((await choose('resolved','guided-request-000007')).body.case.messages.length,resolved.body.case.messages.length);
const otherCase=await call({...payload,requestId:'guided-other-000001',optionId:'other'});const oid=otherCase.body.case.id;
const describe=await call({...payload,caseId:oid,requestId:'guided-other-000002',message:'Something unusual happened'});assert.equal(describe.body.case.messages.filter(m=>m.author==='agent').length,1);
const humanBody={...payload,caseId:oid,requestId:'guided-other-000003',optionId:'human',message:'My unsent details'};
const human=await call(humanBody);assert.equal(human.body.case.humanSupport,true);assert(human.body.case.messages.some(m=>m.text==='My unsent details'));assert(human.body.case.messages.some(m=>m.text==='Something unusual happened'));assert.equal(human.body.case.supportOptions.length,0);assert.equal((await call(humanBody)).body.case.messages.length,human.body.case.messages.length);
const assign={action:'case-assign',caseId:oid,updatedAt:store.cases[oid].updatedAt};assert.equal((await call(assign,{workspace:'merchant'},admin)).statusCode,200);
let joined=(await call()).body.cases.find(c=>c.id===oid);assert.equal(joined.staffJoined,true);assert.equal(joined.messages.filter(m=>m.kind==='staff_joined').length,1);assert.match(joined.messages.find(m=>m.kind==='staff_joined').text,/Sarah joined/);
await call({action:'case-reply',caseId:oid,updatedAt:store.cases[oid].updatedAt,reason:'I have your details.'},{workspace:'merchant'},admin);
joined=(await call()).body.cases.find(c=>c.id===oid);assert.equal(joined.messages.filter(m=>m.kind==='staff_joined').length,1);assert.equal(joined.messages.at(-1).displayName,'Sarah');assert(!JSON.stringify(joined).includes('staff@example.test'));
console.log('PASS guided topics, one-time typed-message prompt, invalid/stale choices, resolution and retry, draft/history preservation, real staff join and no duplicate join or private identity leak.');

now+=86400001;
for(const [topic,leaf] of [['payments','processing'],['integration','api'],['account','verification'],['receipts','receipt']]){
 const start=await call({...payload,optionId:topic,requestId:'topic-start-'+topic+'-00001'});assert.equal(start.statusCode,200);
 const detail=await call({...payload,caseId:start.body.case.id,optionId:leaf,requestId:'topic-leaf-'+topic+'-00001'});assert.equal(detail.statusCode,200);assert(detail.body.case.supportOptions.some(o=>o.id==='human'));now+=60001;
}
console.log('PASS all primary topic categories expose guidance and a human escape.');

assert.equal((await call({...payload,requestId:undefined})).statusCode,400);assert.equal((await call({...payload,requestId:'invalid'})).statusCode,400);console.log('PASS missing and malformed request IDs cannot bypass validation through duplicate lookup.');

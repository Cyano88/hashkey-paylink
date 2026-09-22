import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
process.env.SMILE_PARTNER_ID='fixture';process.env.SMILE_API_KEY='fixture-secret';process.env.SMILE_ENVIRONMENT='sandbox'
const state={values:new Map(),tail:Promise.resolve(),calls:[],result:null};globalThis.__kycFixture=state
const mocks={
 'render-durable-store':`export const readDurableJson=async k=>structuredClone(globalThis.__kycFixture.values.get(k));export const mutateDurableJson=async(k,f)=>{const s=globalThis.__kycFixture;const p=s.tail.then(async()=>{const v=await f(structuredClone(s.values.get(k)));s.values.set(k,v);return structuredClone(v)});s.tail=p.catch(()=>{});return p}`,
 'local-currency-profile':`export const verifiedPrivyUser=async req=>{const id=req.headers.authorization;if(!id)throw Object.assign(Error('Sign in'),{status:401});return{userId:id,email:'fixture@example.invalid'}}`,
}
await mkdir('.codex-temp',{recursive:true})
await build({entryPoints:['api/pocket/kyc.ts'],outfile:'.codex-temp/kyc-fixture.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},args=>{const key=Object.keys(mocks).find(k=>args.path.endsWith('/'+k+'.js'));if(key)return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}))}}]})
const {default:m}=await import('../.codex-temp/kyc-fixture.cjs')
const sign=timestamp=>createHmac('sha256','fixture-secret').update(timestamp).update('fixture').update('sid_request').digest('base64')
const response=(data)=>{const timestamp=new Date().toISOString();return{...data,timestamp,signature:sign(timestamp)}}
globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);state.calls.push({url,body});if(url.endsWith('/token'))return new Response(JSON.stringify({token:'fixture-session'}));if(state.result?.missing)return new Response(JSON.stringify({code:'2304'}),{status:400});return new Response(JSON.stringify(response(state.result)))}
async function request(owner,body,callback=false){const r={code:200,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};await(callback?m.pocketKycCallback:m.default)({method:'POST',headers:{authorization:owner},body},r);return r}
assert.equal((await request('',{action:'start',consent:true})).code,401)
assert.equal((await request('alice',{action:'start'})).code,400)
const starts=await Promise.all([request('alice',{action:'start',consent:true,userId:'bob'}),request('alice',{action:'start',consent:true})]);assert.deepEqual(starts.map(r=>r.code).sort(),[200,409]);assert.equal(state.calls.filter(c=>c.url.endsWith('/token')).length,1)
const jobId=starts.find(r=>r.code===200).body.jobId;const userId=m.smileUserId('alice');assert.equal(state.calls[0].body.user_id,userId)
assert.equal((await request('bob',{action:'status',jobId})).body.status,'not_started')
state.result={missing:true};const unsubmitted=await request('alice',{action:'status'});assert.equal(unsubmitted.body.canResume,true);assert.equal(unsubmitted.body.status,'pending');const resume=await request('alice',{action:'resume',consent:true});assert.equal(resume.code,200);assert.equal(resume.body.jobId,jobId);assert.equal(state.calls.filter(c=>c.url.endsWith('/token')).at(-1).body.job_id,jobId);let store=[...state.values.values()].find(v=>v.jobs);let job=store.jobs[0];job.checkedAt=0
const params={job_id:jobId,user_id:userId,job_type:1}
state.result={job_found:true,job_complete:true,job_success:true,result:{PartnerParams:params,Country:'NG',IDType:'BVN',DOB:'1990-02-03',FirstName:'Test',LastName:'Person',ResultCode:'0810'}}
assert.equal((await request('',{PartnerParams:params,signature:'bad',timestamp:new Date().toISOString()},true)).code,401)
assert.equal((await request('',response({PartnerParams:{...params,user_id:'other'}}),true)).code,404)
const approved=await request('alice',{action:'status'});assert.equal(approved.body.status,'passed');assert.equal(approved.body.verified,false)
assert.equal((await request('alice',{action:'eligibility'})).body.verified,false);await assert.rejects(()=>m.requireProductionKyc('alice'),/Complete identity/)
assert.equal((await request('',response({PartnerParams:params}),true)).code,200)
assert.equal((await request('alice',{action:'start',consent:true})).code,409)
assert.equal(JSON.stringify(approved.body).includes('Test Person'),false)
const second=await request('bob',{action:'start',consent:true});const secondParams={job_id:second.body.jobId,user_id:m.smileUserId('bob'),job_type:1}
state.result={job_found:true,job_complete:true,job_success:false,result:{PartnerParams:secondParams,ResultCode:'0811'}}
const forged=await request('',response({PartnerParams:secondParams,ResultCode:'0810'}),true);assert.equal(forged.code,200);assert.equal((await request('bob',{action:'status'})).body.status,'failed')
await request('carol',{action:'start',consent:true});state.result={job_found:true,job_complete:true,job_success:true,result:{ResultCode:'0810',Country:'NG',IDType:'BVN',DOB:'1990-02-03',FirstName:'Test',LastName:'Person'}};assert.equal((await request('carol',{action:'status'})).body.status,'review')
// A browser upload report suppresses duplicate capture, but cannot approve KYC.
const uploadStart=await request('upload-user',{action:'start',consent:true});
assert.equal((await request('bob',{action:'uploaded',jobId:uploadStart.body.jobId})).code,409);
const uploaded=await request('upload-user',{action:'uploaded',jobId:uploadStart.body.jobId});
assert.equal(uploaded.body.verified,false);assert.equal(uploaded.body.status,'pending');assert.equal(uploaded.body.canResume,false);
assert.equal((await request('upload-user',{action:'resume',consent:true})).code,409);
const uploadStore=[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===uploadStart.body.jobId));
const delayed=uploadStore.jobs[0];delayed.createdAt=Date.now()-21*60_000;delayed.checkedAt=0;state.result={missing:true};
assert.equal((await request('upload-user',{action:'status'})).body.status,'review');
[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===delayed.id)).jobs[0].checkedAt=0;
state.result={job_found:true,job_complete:true,job_success:true,result:{PartnerParams:{job_id:delayed.id,user_id:m.smileUserId('upload-user'),job_type:1},Country:'NG',IDType:'BVN',DOB:'1990-02-03',FirstName:'Test',LastName:'Person',ResultCode:'0810'}};
assert.equal((await request('upload-user',{action:'status'})).body.status,'passed');
const abandoned=await request('abandoned',{action:'start',consent:true});
const abandonedJob=[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===abandoned.body.jobId)).jobs[0];abandonedJob.createdAt=Date.now()-30*60_000;state.result={missing:true};
const recoverable=await request('abandoned',{action:'status'});assert.equal(recoverable.body.status,'review');assert.equal(recoverable.body.canResume,true);
const recovered=await request('abandoned',{action:'resume',consent:true});assert.equal(recovered.code,200);assert.equal(recovered.body.jobId,abandoned.body.jobId);

// Unlaunched countries cannot create a durable job or call the provider.
const countBefore = state.calls.length
for (const country of ['KE', 'RW', 'US', null]) {
 const blocked = await request('country-'+country,{action:'start',consent:true,country})
 assert.equal(blocked.code,['KE','RW'].includes(country)?409:400)
}
assert.equal(state.calls.length,countBefore)
assert.equal((await request('abandoned',{action:'resume',consent:true,country:'KE'})).code,409)
const regional = await request('regional',{action:'start',consent:true,country:'NG',provider:'sumsub'})
assert.equal(regional.body.verification.country,'NG');assert.equal(regional.body.verification.provider,'smile')
const regionalJob=[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===regional.body.jobId)).jobs[0]
assert.equal(regionalJob.country,'NG');assert.equal(regionalJob.provider,'smile');assert.equal(regionalJob.policyVersion,'ng-smile-bvn-v2')
state.result={job_found:true,job_complete:true,job_success:true,result:{PartnerParams:{job_id:regionalJob.id,user_id:regionalJob.userId,job_type:1},Country:'KE',FirstName:'Test',LastName:'Person',ResultCode:'0810'}}
assert.equal((await request('regional',{action:'status'})).body.status,'review')
console.log('PASS country launch gates, persisted provider/country/policy, original-country resume, and mismatched-country approval rejection.')

process.env.SMILE_ENVIRONMENT='production';assert.equal((await request('alice',{action:'start',consent:true})).code,503)
console.log('PASS auth, consent, atomic duplicate prevention, owner isolation, callback authentication, authoritative reconciliation, unknown-result review, sandbox isolation production rollout guard, and unsubmitted-session recovery without replacement jobs.')

assert.equal(m.publicKyc({status:'failed',resultCode:'0811'},'sandbox').failureReason,'face_mismatch')
assert.equal(m.publicKyc({status:'pending'},'sandbox').failureReason,null)
assert.equal(m.publicKyc({status:'failed'},'sandbox').failureReason,'session_failed')

// Two-step verification uses independent, owner-bound evidence.
process.env.SMILE_ENVIRONMENT='sandbox'
assert.equal((await request('no-bvn',{action:'start',method:'nin',consent:true})).code,409)
assert.equal((await request('no-bvn',{action:'start',method:'government_id',consent:true})).code,409)
async function passJob(owner, start, method='bvn', name='Test Person', dob='1990-02-03') {
 const record=[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===start.body.jobId));const job=record.jobs.find(j=>j.id===start.body.jobId);job.checkedAt=0;
 state.result={job_found:true,job_complete:true,job_success:true,result:{PartnerParams:{job_id:job.id,user_id:job.userId,job_type:method==='government_id'?6:1},Country:'NG',FullName:name,DOB:dob,IDType:method==='government_id'?'PASSPORT':method==='nin'?'NIN_V2':'BVN',ResultCode:'0810'}};
 return request(owner,{action:'status'})
}
for(const method of ['nin','government_id']) {
 const owner='two-step-'+method;const bvn=await request(owner,{action:'start',consent:true});const first=await passJob(owner,bvn)
 assert.equal(first.body.workflow.needsAdditional,true);assert.equal(first.body.workflow.complete,false);assert.equal(first.body.verified,false)
 const second=await request(owner,{action:'start',method,consent:true});assert.equal(second.code,200)
 assert.equal(second.body.verification.product,method==='nin'?'biometric_kyc':'doc_verification')
 assert.equal((await request(owner,{action:'start',method,consent:true})).code,409)
 assert.equal((await request(owner,{action:'resume',method:method==='nin'?'government_id':'nin',consent:true})).code,409)
 const done=await passJob(owner,second,method);assert.equal(done.body.workflow.complete,true);assert.equal(done.body.verified,false)
 await assert.rejects(()=>m.requireProductionKyc(owner),/Complete identity/)
 const stored=[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===second.body.jobId));const job=stored.jobs.at(-1)
 assert.notEqual(job.userId,stored.jobs[0].userId)
 assert.equal((await request('',response({PartnerParams:{job_id:job.id,user_id:job.userId,job_type:method==='nin'?1:6}}),true)).code,200)
 assert.equal(JSON.stringify(done.body).includes('1990-02-03'),false)
 assert.equal(JSON.stringify(done.body).includes('identityMatch'),false)
}
const mismatchBvn=await request('mismatch',{action:'start',consent:true});await passJob('mismatch',mismatchBvn)
const mismatchId=await request('mismatch',{action:'start',method:'government_id',consent:true});const mismatch=await passJob('mismatch',mismatchId,'government_id','Different Person')
assert.equal(mismatch.body.status,'review');assert.equal(mismatch.body.workflow.complete,false);assert.equal(mismatch.body.failureReason,'identity_mismatch')
const wrongTypeBvn=await request('wrong-type',{action:'start',consent:true});await passJob('wrong-type',wrongTypeBvn)
const wrongTypeNin=await request('wrong-type',{action:'start',method:'nin',consent:true});const wrong=await passJob('wrong-type',wrongTypeNin,'bvn')
assert.equal(wrong.body.status,'review');assert.equal(wrong.body.workflow.complete,false)
// A production BVN alone must not satisfy the new eligibility gate.
process.env.SMILE_ENVIRONMENT='production';process.env.SMILE_PRODUCTION_ENABLED='true'
const prod=await request('production-pair',{action:'start',consent:true});await passJob('production-pair',prod)
await assert.rejects(()=>m.requireProductionKyc('production-pair'),/Complete identity/)
const prodNin=await request('production-pair',{action:'start',method:'nin',consent:true});const prodComplete=await passJob('production-pair',prodNin,'nin')
assert.equal(prodComplete.body.verified,true);assert.equal(await m.requireProductionKyc('production-pair'),'Test Person')
console.log('PASS BVN prerequisite, both second-step routes, product and owner binding, identity matching, duplicate protection, and two-step production eligibility.')

// Provisional provider reviews can reach a final verdict instead of freezing.
const reviewStart=await request('review-transition',{action:'start',consent:true});
const reviewJob=[...state.values.values()].find(v=>v.jobs?.some(j=>j.id===reviewStart.body.jobId)).jobs[0];
state.result={job_found:true,job_complete:true,job_success:false,result:{PartnerParams:{job_id:reviewJob.id,user_id:reviewJob.userId,job_type:1},ResultCode:'0812'}};
assert.equal((await request('review-transition',{action:'status'})).body.status,'review');
assert.equal((await passJob('review-transition',reviewStart)).body.status,'passed');
console.log('PASS provisional review remains refreshable until final provider verdict.')

const missingDob=await request('missing-dob',{action:'start',consent:true});
assert.equal((await passJob('missing-dob',missingDob,'bvn','Test Person','')).body.status,'review');
console.log('PASS new BVN policy requires government ID type and matching attributes; legacy policy remains readable.')

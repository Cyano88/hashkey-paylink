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
state.result={job_found:true,job_complete:true,job_success:true,result:{PartnerParams:params,Country:'NG',FirstName:'Test',LastName:'Person',ResultCode:'0810'}}
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
await request('carol',{action:'start',consent:true});state.result={job_found:true,job_complete:true,job_success:true,result:{ResultCode:'0810',Country:'NG',FirstName:'Test',LastName:'Person'}};assert.equal((await request('carol',{action:'status'})).body.status,'review')
process.env.SMILE_ENVIRONMENT='production';assert.equal((await request('alice',{action:'start',consent:true})).code,503)
console.log('PASS auth, consent, atomic duplicate prevention, owner isolation, callback authentication, authoritative reconciliation, unknown-result review, sandbox isolation production rollout guard, and unsubmitted-session recovery without replacement jobs.')

import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createHmac} from 'node:crypto'
process.env.SMILE_PARTNER_ID='fixture';process.env.SMILE_API_KEY='fixture-secret';process.env.SMILE_ENVIRONMENT='sandbox'
const state={values:new Map(),tail:Promise.resolve(),calls:[],result:null,tokenFailure:0};globalThis.__kycV3Fixture=state
const mocks={
 'render-durable-store':`export const readDurableJson=async k=>structuredClone(globalThis.__kycV3Fixture.values.get(k));export const mutateDurableJson=async(k,f)=>{const s=globalThis.__kycV3Fixture;const p=s.tail.then(async()=>{const v=await f(structuredClone(s.values.get(k)));s.values.set(k,v);return structuredClone(v)});s.tail=p.catch(()=>{});return p}`,
 'local-currency-profile':`export const verifiedPrivyUser=async req=>{if(!req.headers.authorization)throw Object.assign(Error('Sign in'),{status:401});return{userId:req.headers.authorization}}`,
}
await build({entryPoints:['api/pocket/kyc-v3.ts'],outfile:'.codex-temp/kyc-v3-fixture.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},args=>{const key=Object.keys(mocks).find(k=>args.path.endsWith('/'+k+'.js'));if(key)return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}))}}]})
const {default:m}=await import('../.codex-temp/kyc-v3-fixture.cjs')
globalThis.fetch=async(url,init)=>{state.calls.push({url,init});if(url.endsWith('/v3/token'))return state.tokenFailure?new Response('{}',{status:state.tokenFailure}):new Response(JSON.stringify({token:'fixture-session'}));return new Response(JSON.stringify(state.result),{status:state.result?.status==='processing'?202:200})}
async function request(owner,body,headers={},query={},callback=false){const r={code:200,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};await(callback?m.pocketKycV3Callback:m.default)({method:'POST',headers:{authorization:owner,...headers},body,query},r);return r}
const job=id=>[...state.values.values()].flatMap(v=>v.jobs||[]).find(j=>j.id===id)
let sequence=0
function event(start,{name='Test Person',dob='1990-02-03',status='clear',product,fields={},fraud=false}={}){const j=job(start.body.jobId),providerId=j.providerJobId||'job_'+String(++sequence).padStart(26,'0'),userId='user_fixture';state.result={status,job_id:providerId,user_id:userId};const timestamp=new Date().toISOString(),signature=createHmac('sha256','fixture-secret').update(timestamp).update('fixture').update('sid_request').digest('base64');return{body:{status,product:product||m.v3Policy(j.method).apiProduct,partner_params:{internal_reference:j.id},id_fields:{full_name:name,date_of_birth:dob,...j.method==='government_id'?{country:'NG',id_type:'PASSPORT'}:{},...fields},antifraud:{summary:{fraud_detected:fraud}}},headers:{'response-timestamp':timestamp,'response-signature':signature,'job-id':providerId,'user-id':userId},query:{reference:j.id,proof:j.callbackProof}}}
const deliver=e=>request('',e.body,e.headers,e.query,true)
const start=(owner,method='bvn')=>request(owner,{action:'start',consent:true,method})
assert.equal((await request('',{action:'start',consent:true})).code,401)
assert.equal((await request('alice',{action:'start'})).code,400)
assert.equal((await request('alice',{action:'start',consent:true,country:'KE'})).code,409)
assert.equal((await start('no-bvn','nin')).code,409)
const starts=await Promise.all([start('alice'),start('alice')]);assert.deepEqual(starts.map(x=>x.code).sort(),[200,409]);const first=starts.find(x=>x.code===200)
assert.equal(first.body.verification.idSelection.NG[0],'BVN');assert.equal(first.body.apiVersion,3)
assert.equal(JSON.stringify(first.body).includes(job(first.body.jobId).callbackProof),false,'Callback proof must not leave backend')
const mint=state.calls.find(x=>x.url.endsWith('/v3/token'));const payload=JSON.parse(mint.init.body.get('payload'));assert.equal(payload.id_type,'BVN');assert.equal(payload.country,'NG');assert.ok(payload.callback_url.includes(job(first.body.jobId).callbackProof));assert.equal(JSON.parse(mint.init.body.get('partner_params')).internal_reference,first.body.jobId)
assert.equal((await request('bob',{action:'uploaded',jobId:first.body.jobId})).code,409)
assert.equal((await request('alice',{action:'resume',consent:true})).code,409,'Concurrent token mint blocked')
job(first.body.jobId).sessionAt=0;assert.equal((await request('alice',{action:'resume',consent:true})).body.jobId,first.body.jobId)
const hint=await request('alice',{action:'uploaded',jobId:first.body.jobId});assert.equal(hint.body.verified,false);assert.equal(hint.body.canResume,false);assert.equal((await request('alice',{action:'resume',consent:true})).code,409)
let e=event(first);assert.equal((await deliver({...e,headers:{...e.headers,'response-signature':'bad'}})).code,401)
assert.equal((await deliver({...e,query:{...e.query,proof:'0'.repeat(64)}})).code,401)
assert.equal((await deliver({...e,body:{...e.body,partner_params:{internal_reference:'other'}}})).code,409)
state.result.status='block';assert.equal((await deliver(e)).code,409,'Webhook cannot override provider truth');state.result.status='clear'
assert.equal((await deliver(e)).code,200);assert.equal((await deliver(e)).code,200,'Callback retry idempotent')
let status=await request('alice',{action:'status'});assert.equal(status.body.workflow.bvnPassed,true);assert.equal(status.body.verified,false)
const second=await start('alice','nin');assert.equal(second.code,200);assert.equal(second.body.verification.idSelection.NG[0],'NIN_V2');e=event(second);assert.equal((await deliver(e)).code,200);status=await request('alice',{action:'status'});assert.equal(status.body.workflow.complete,true);assert.equal(status.body.verified,false,'Sandbox cannot approve live POS');await assert.rejects(()=>m.requireV3ProductionKyc('alice'),/Complete identity/)
const mismatch=await start('mismatch');await deliver(event(mismatch));const mismatchSecond=await start('mismatch','government_id');await deliver(event(mismatchSecond,{name:'Other Person'}));assert.equal((await request('mismatch',{action:'status'})).body.failureReason,'identity_mismatch')
for(const[name,options]of [['empty',{dob:''}],['fraud',{fraud:true}],['wrong-product',{product:'document_verification'}]]){const s=await start(name);const r=await deliver(event(s,options));if(name==='wrong-product')assert.equal(r.code,409);assert.notEqual((await request(name,{action:'status'})).body.status,'passed')}
const docOwner=await start('doc');await deliver(event(docOwner));const docSecond=await start('doc','government_id');await deliver(event(docSecond,{fields:{country:'US'}}));assert.notEqual((await request('doc',{action:'status'})).body.status,'passed')
state.tokenFailure=402;const payment=await start('wallet-empty');assert.equal(payment.code,402);assert.match(payment.body.error,/funded/);state.tokenFailure=0;assert.equal((await start('wallet-empty')).code,200,'Failed token creation allows fresh attempt')
process.env.SMILE_ENVIRONMENT='production';assert.equal((await start('production')).code,503);process.env.SMILE_PRODUCTION_ENABLED='true';assert.equal((await request('alice',{action:'status'})).body.status,'not_started');const prod=await start('production');await deliver(event(prod));const prodDoc=await start('production','government_id');await deliver(event(prodDoc));assert.equal((await request('production',{action:'status'})).body.verified,true);assert.equal(await m.requireV3ProductionKyc('production'),'Test Person')
const raw=JSON.stringify([...state.values.values()]);assert.equal(raw.includes('1990-02-03'),false);assert.equal(raw.includes('id_number'),false)
console.log('PASS V3 auth, bound token policy and callback proof, owner isolation, duplicate prevention, recovery, signed callback plus provider truth, replay, two-step identity matching, sandbox isolation, billing errors, and no raw ID/DOB persistence.')

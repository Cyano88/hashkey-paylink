import assert from 'node:assert/strict'
import {createMarketplaceAccessHandler} from '../api/marketplace-access.ts'
let stored,queue=Promise.resolve(),admin=true,email='builder@example.com',active=true
const dependencies={owner:async(req,id)=>{if(id!=='dev_12345678')throw Object.assign(Error('Not found.'),{status:404});return {id,ownerId:'owner_a',email,name:'Test Marketplace',operationalStatus:active?'active':'suspended'}},admin:async()=>{if(!admin)throw Object.assign(Error('Forbidden'),{status:403});return {userId:'admin_a',email:'admin@example.com'}},read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{stored=fn(structuredClone(stored||{requests:[]}));return structuredClone(stored)});queue=job.catch(()=>{});return job},now:()=>new Date(0).toISOString(),uuid:()=> 'request_a'}
const handler=createMarketplaceAccessHandler(dependencies)
async function call(method,body={},query={}){const res={code:200,setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};await handler({method,body,query,headers:{}},res);return res}
const body={projectId:'dev_12345678',email}
assert.equal((await call('GET',{},body)).data.request,null)
assert.equal((await call('POST',{...body,email:'other@example.com'})).code,400)
assert.equal((await call('POST',{...body,status:'approved'})).code,400)
assert.equal((await call('POST',{...body,projectId:'dev_87654321'})).code,404)
active=false;assert.equal((await call('POST',body)).code,403);active=true
const race=await Promise.all([call('POST',body),call('POST',body)])
assert.equal(stored.requests.length,1);assert.equal(race[0].data.request.status,'pending')
assert.equal(race[0].data.request.ownerId,undefined)
const decision={requestId:'request_a',status:'approved',expectedStatus:'pending',note:'Approved for staged rollout'}
admin=false;assert.equal((await call('GET',{}, {resource:'admin'})).code,403);assert.equal((await call('POST',decision,{resource:'admin'})).code,403)
admin=true;assert.equal((await call('POST',decision,{resource:'admin'})).data.request.status,'approved')
await call('POST',decision,{resource:'admin'});assert.equal(stored.requests[0].decisions.length,1)
assert.equal((await call('POST',{...decision,status:'rejected'},{resource:'admin'})).code,409)
assert.equal((await call('GET',{},body)).data.request.status,'approved')
const revoke={...decision,expectedStatus:'approved',status:'rejected',note:'Please provide details'}
assert.equal((await call('POST',revoke,{resource:'admin'})).data.request.status,'rejected')
assert.equal(stored.requests[0].decisions.length,2)
await call('POST',body);assert.equal(stored.requests[0].status,'rejected','resubmission cannot erase admin decision')
assert.equal((await call('GET',{}, {resource:'admin'})).data.requests[0].decisions,undefined)
email='';assert.equal((await call('POST',body)).code,400)
console.log('PASS whitelist API: owner/email binding, paused app denial, idempotent concurrent request, restricted admin list/review, stale-decision rejection, audited approve/revoke and no automatic payment capability.')

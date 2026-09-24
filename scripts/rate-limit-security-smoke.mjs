import assert from 'node:assert/strict'
import {rateLimit} from '../api/rate-limit.ts'
const originalNow=Date.now
let now=1000000
Date.now=()=>now
const middleware=rateLimit({name:'security-test',windowMs:60000,max:2})
function call(ip){let status=200,passed=false;const headers={};middleware({ip,socket:{}},{setHeader(k,v){headers[k]=v},status(s){status=s;return this},json(){return this}},()=>{passed=true});return {status,passed,headers}}
try{
 assert.equal(call('original').passed,true)
 assert.equal(call('original').passed,true)
 assert.equal(call('original').status,429)
 for(let i=0;i<9999;i++)assert.equal(call('other-'+i).passed,true)
 const churn=call('new-after-capacity');assert.equal(churn.status,429);assert.equal(churn.headers['Retry-After'],'60')
 assert.equal(call('original').status,429,'Capacity pressure must not reset an existing exhausted identity')
 assert.equal(call('other-0').passed,true,'Tracked users retain their remaining allowance at capacity')
 now+=60000
 assert.equal(call('new-after-capacity').passed,true,'Expired buckets permit new clients again')
 assert.equal(call('original').passed,true)
 console.log('PASS rate limit: identity churn cannot evict active limits; tracked users retain allowance; expiry restores admission.')
}finally{Date.now=originalNow}

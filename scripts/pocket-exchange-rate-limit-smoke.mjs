import assert from 'node:assert/strict'
import {createExchangeRateLimit} from '../api/pocket/exchange-rate-limit.ts'
import {rateLimit} from '../api/rate-limit.ts'
const limiter=createExchangeRateLimit(rateLimit({name:'write-fixture',max:20,windowMs:60000}))
function call(method,action){let status=200,passed=false;const headers={};limiter({method,body:{action},ip:'fixture',socket:{}},{setHeader(k,v){headers[k]=v},status(s){status=s;return this},json(){return this}},()=>passed=true);return {status,passed,headers}}
for(let i=0;i<60;i++)assert.equal(call('POST','status').passed,true)
for(let i=0;i<30;i++)assert.equal(call('POST','quote').passed,true)
assert.equal(call('POST','quote').status,429)
for(let i=0;i<20;i++)assert.equal(call('POST','execute').passed,true,'reads and quotes must not consume writes')
assert.equal(call('POST','execute').status,429)
assert.equal(call('POST','resume').status,429,'unknown/mutating actions keep write protection')
assert.equal(call('POST','status').passed,true,'exhausted writes must not block recovery')
for(let i=0;i<59;i++)assert.equal(call('GET').passed,true)
assert.equal(call('POST','verify').status,429)
assert.ok(Number(call('GET').headers['Retry-After'])>0)
console.log('PASS exchange rate budgets: reads, quotes and writes isolated; write limits preserved; recovery survives exhausted submission allowance; bounded reads and Retry-After')

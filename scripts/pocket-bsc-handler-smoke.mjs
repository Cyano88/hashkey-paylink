import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createBscSwapHandler} from '../api/pocket/bsc-swap.ts'
import {sealBscSwap} from '../api/pocket/bsc-swap-quote.ts'
const q=JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json','utf8'))[0],secret='fixture-secret-'.repeat(4)
const token=sealBscSwap(q,secret,q.issuedAt)
function fixture(){
 const s={enabled:true,owner:q.ownerId,linked:[{id:q.walletId,type:'wallet',chainType:'ethereum',walletClientType:'privy',address:q.walletAddress}],calls:[],submitThrows:false,readThrows:false,state:'prepared',authThrows:false}
 const op=()=>({quote:q,fingerprint:'fixture',state:s.state,createdAt:q.issuedAt,updatedAt:q.issuedAt})
 const handler=createBscSwapHandler({identity:async()=>{if(s.authThrows)throw Object.assign(Error('sensitive auth payload'),{status:401});return {userId:s.owner}},user:async()=>({linkedAccounts:s.linked}),enabled:()=>s.enabled,appId:'fixtureappid',secret,now:()=>q.issuedAt,runtime:{balance:async()=>10n**18n},operations:{list:async binding=>{assert.equal(binding.ownerId,s.owner);assert.equal(binding.walletId,q.walletId);return s.state==='pending'?[op()]:[]},prepare:async(quote,approval)=>{assert.equal(approval,'fixture-pin');s.calls.push('prepare');return op()},submit:async()=>{s.calls.push('submit');if(s.submitThrows)throw Error('private-provider-diagnostic');return op()},status:async()=>{s.calls.push('status');return op()},cancel:async()=>{s.calls.push('cancel');return op()},read:async()=>{if(s.readThrows)throw Error('database unavailable');return op()}}})
 const request=async(body={},method='POST')=>{
  const r={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(value){this.value=value;return this}}
  await handler({method,body:{wallet:q.walletAddress,quoteToken:token,action:'prepare',...body},headers:{'x-pocket-payment-approval':'fixture-pin'}},r)
  return r
 }
 return {s,request}
}
let f=fixture(),r=await f.request();assert.equal(r.code,200);assert.equal(r.value.request.body.caip2,'eip155:56');assert.equal(r.headers['Cache-Control'],'no-store')
f=fixture();f.s.linked=[];assert.equal((await f.request()).code,403);assert.deepEqual(f.s.calls,[])
f=fixture();f.s.owner='not-owner';assert.equal((await f.request()).code,409);assert.deepEqual(f.s.calls,[])
f=fixture();f.s.linked.push(f.s.linked[0]);assert.equal((await f.request()).code,403)
f=fixture();f.s.authThrows=true;r=await f.request();assert.equal(r.code,401);assert.ok(!JSON.stringify(r.value).includes('sensitive'))
f=fixture();f.s.enabled=false;assert.equal((await f.request()).code,409)
assert.equal((await f.request({action:'status'})).code,200);assert.equal((await f.request({action:'cancel'})).code,200)
f=fixture();assert.equal((await f.request({quoteToken:token+'x'})).code,409);assert.deepEqual(f.s.calls,[])
f=fixture();assert.equal((await f.request({action:'balances'})).value.balances.USDT,'1')
f=fixture();f.s.submitThrows=true;f.s.state='pending';r=await f.request({action:'submit',authorization:'signature'});assert.equal(r.code,202);assert.equal(r.value.status,'pending');assert.ok(!JSON.stringify(r.value).includes('diagnostic'))
f=fixture();f.s.submitThrows=true;f.s.readThrows=true;r=await f.request({action:'submit',authorization:'signature'});assert.equal(r.code,503);assert.equal(r.value.code,'swap_outcome_unknown')
f=fixture();f.s.submitThrows=true;r=await f.request({action:'submit',authorization:'signature'});assert.equal(r.code,409);assert.equal(r.value.code,'swap_not_submitted');assert.ok(!JSON.stringify(r.value).includes('diagnostic'))
f=fixture();assert.equal((await f.request({},'GET')).code,405)
f=fixture();f.s.enabled=false;f.s.state='pending';r=await f.request({action:'capabilities'});assert.equal(r.code,200);assert.equal(r.value.enabled,false);assert.equal(r.value.pending.length,1);assert.equal(r.value.pending[0].quote.network,'bsc');
console.log('PASS BSC HTTP boundary: authenticated ownership, duplicate wallet rejection, sealed quote binding, execution gate with recovery retained, balances, PIN forwarding and unknown-submission response; disabled capabilities retain authenticated recovery')

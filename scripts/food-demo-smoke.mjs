import assert from 'node:assert/strict'
import {createFoodDemoHandler} from '../api/food-demo.ts'
let store={orders:{}},enabled=false,calls=[],status='pending',clock=Date.now();const checkoutId='chkx_'+'1'.repeat(24)
const h=createFoodDemoHandler({ready:()=>enabled,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},now:()=>clock,price:async()=>200,call:async(path,body,key)=>{calls.push({path,body,key});return body?{ok:true,checkoutId,checkoutUrl:'/pay/c/'+checkoutId}:{ok:true,status,checkout:{id:checkoutId,asset:'NVDAx',amount:'0.0225'}}}})
async function call(method,body={},query={}){let code=200,data;await h({method,body,query},{setHeader(){},status(n){code=n;return this},json(d){data=d;return this},sendStatus(n){code=n}});return{code,data}}
const id='a'.repeat(32),body={requestId:id,items:[{id:'jollof',quantity:1}],asset:'NVDAx',amount:'0.00001',recipient:'attacker'}
assert.equal((await call('GET')).data.liveEnabled,false);assert.equal((await call('POST',body)).code,503);assert.equal(calls.length,0)
enabled=true;assert.equal((await call('POST',{...body,items:[{id:'jollof',quantity:-1}]})).code,400)
assert.equal((await call('POST',body)).code,200);assert.equal(calls[0].body.amount,'0.0225');assert.equal(calls[0].body.recipient,undefined);assert.equal(calls[0].body.swap,false)
assert.equal((await call('POST',body)).code,200);assert.equal(calls.length,1,'Retry must reuse checkout')
assert.equal((await call('POST',{...body,asset:'USDC'})).code,409)
assert.equal((await call('GET',{}, {id})).data.order.status,'pending')
assert.equal((await call('GET',{}, {id,paid:'true'})).data.order.status,'pending','Return parameters cannot confirm payment')
status='paid';assert.equal((await call('GET',{}, {id})).data.order.status,'paid')
assert.equal((await call('GET',{}, {id:'b'.repeat(32)})).code,404)
clock+=26*60_000;assert.equal((await call('POST',body)).code,410)
console.log('PASS food store: gated live mode, server-priced basket, accepted assets, immutable retry, ignored recipient/amount overrides, authoritative paid status and expiry.')

let circleStore={orders:{}},createdBody,circleStatus='pending'
const circleId='chk_12345678',circleHandler=createFoodDemoHandler({ready:()=>true,read:async()=>structuredClone(circleStore),mutate:async fn=>{circleStore=fn(structuredClone(circleStore));return structuredClone(circleStore)},now:Date.now,price:async()=>{throw Error('USDC must not use stock pricing')},call:async(path,body)=>{if(body){createdBody=body;return{ok:true,checkoutId:circleId,checkoutUrl:'/pay/c/'+circleId+'?attempt=attempt_123'}}return{ok:true,checkoutId:circleId,status:circleStatus,settlementMode:'usdc',network:'base',payment:{amount:'4.5'}}}})
async function circleCall(method,body={},query={}){let code=200,data;await circleHandler({method,body,query},{setHeader(){},status(n){code=n;return this},json(d){data=d;return this},sendStatus(n){code=n}});return{code,data}}
const circleBody={requestId:'c'.repeat(32),items:[{id:'jollof',quantity:1}],asset:'USDC',rail:'circle'}
assert.equal((await circleCall('POST',circleBody)).code,200)
assert.equal(createdBody.kind,'service');assert.equal(createdBody.rail,undefined);assert.equal(createdBody.amount,'4.5')
assert.equal((await circleCall('GET',{}, {id:circleBody.requestId})).data.order.status,'pending')
circleStatus='paid';assert.equal((await circleCall('GET',{}, {id:circleBody.requestId})).data.order.status,'paid')
assert.equal((await circleCall('POST',{...circleBody,rail:'xlayer'})).code,409)
assert.equal((await circleCall('POST',{...circleBody,requestId:'d'.repeat(32),asset:'NVDAx'})).code,400)
console.log('PASS Circle USDC routing, verified receipt, immutable rail and X Layer-only NVDAx.')

let draftStore={orders:{}},allowed=[{id:'circle',name:'Lunchroom',kind:'stablecoins',currency:'USD',assets:['USDC'],networks:['base'],revision:'1'}],sent
const draftHandler=createFoodDemoHandler({ready:()=>true,choices:async()=>allowed,read:async()=>structuredClone(draftStore),mutate:async fn=>{draftStore=fn(structuredClone(draftStore));return structuredClone(draftStore)},now:Date.now,call:async(path,body)=>{sent=body;return {ok:true,checkoutId:'chk_12345678',checkoutUrl:'/pay/c/chk_12345678?attempt=test_123'}}})
async function draftCall(method,body={},query={}){let code=200,data;await draftHandler({method,body,query},{setHeader(){},status(n){code=n;return this},json(d){data=d;return this},sendStatus(n){code=n}});return{code,data}}
const draftId='e'.repeat(32)
assert.equal((await draftCall('POST',{action:'prepare',requestId:draftId,items:[{id:'jollof',quantity:1}]})).data.checkoutUrl,'/pay/order/'+draftId)
assert.equal(sent,undefined,'Store handoff must not select or create a rail checkout')
assert.deepEqual((await draftCall('GET',{}, {id:draftId,purpose:'selection'})).data.destinations,allowed)
assert.equal((await draftCall('POST',{requestId:draftId,asset:'NVDAx',rail:'xlayer'})).code,400,'Reject disabled project assets')
assert.equal((await draftCall('POST',{requestId:draftId,asset:'USDC',rail:'circle',network:'solana'})).code,400,'Reject disabled project networks')
assert.equal((await draftCall('POST',{requestId:draftId,asset:'USDC',rail:'circle',network:'base',items:[{id:'plantain',quantity:1}],amount:'0.01'})).code,200)
assert.equal(sent.amount,'4.5','Keep the server order total');assert.equal(sent.defaultNetwork,'base')
console.log('PASS store handoff, project-controlled choices, disabled option rejection and fixed server order.')

draftStore.drafts[draftId].createdAt-=26*60_000
assert.equal((await draftCall('GET',{}, {id:draftId,purpose:'selection'})).data.checkoutUrl,'/pay/c/chk_12345678?attempt=test_123','Refresh resumes an existing payment even after the selection deadline')

for(const mode of ['ngn','ugx']){
 let localStore={orders:{}},localStatus='processing',reportedAmount='4.6',reportedMode=mode,createCount=0
 const destination={id:'circle',name:'Lunchroom',kind:'bank',currency:mode.toUpperCase(),assets:['USDC'],networks:['base'],revision:'1'}
 const handler=createFoodDemoHandler({ready:()=>true,choices:async()=>[destination],read:async()=>structuredClone(localStore),mutate:async fn=>{localStore=fn(structuredClone(localStore));return structuredClone(localStore)},call:async(path,body)=>{
  if(body){createCount++;assert.equal(body.amount,'4.5');return {ok:true,checkoutId:'chk_87654321',checkoutUrl:'/pay/c/chk_87654321',settlementMode:mode,amount:'4.6'}}
  return {ok:true,checkoutId:'chk_87654321',status:localStatus,settlementMode:reportedMode,network:'base',payment:{amount:reportedAmount}}
 }})
 const localId=(mode==='ngn'?'f':'1').repeat(32)
 async function request(method,body={},query={}){let code=200,data;await handler({method,body,query},{setHeader(){},status(n){code=n;return this},json(d){data=d;return this},sendStatus(n){code=n}});return {code,data}}
 assert.deepEqual((await request('GET')).data.acceptedAssets,['USDC'])
 await request('POST',{action:'prepare',requestId:localId,items:[{id:'jollof',quantity:1}]})
 assert.deepEqual((await request('GET',{}, {id:localId,purpose:'selection'})).data.destinations,[destination])
 const selection={requestId:localId,asset:'USDC',rail:'circle',network:'base'}
 assert.equal((await request('POST',selection)).code,200)
 assert.equal((await request('POST',selection)).code,200);assert.equal(createCount,1)
 assert.equal((await request('GET',{}, {id:localId})).data.order.status,'pending','USDC confirmation alone is not bank delivery')
 localStatus='paid';reportedMode='usdc';assert.equal((await request('GET',{}, {id:localId})).data.order.status,'pending','Settlement mode must match the created checkout')
 reportedMode=mode;reportedAmount='4.5';assert.equal((await request('GET',{}, {id:localId})).data.order.status,'pending','Payment must match the provider payable amount')
 reportedAmount='4.6';const receipt=(await request('GET',{}, {id:localId})).data.order
 assert.equal(receipt.status,'paid');assert.equal(receipt.amount,'4.6');assert.equal(receipt.cents,450)
}
console.log('PASS local bank/mobile settlement: configured choices, exact provider amount, immutable retry and delivery-gated receipt.')

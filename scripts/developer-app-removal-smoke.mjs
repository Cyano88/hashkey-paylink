import assert from 'node:assert/strict'
import {reviewAppRemoval,createAppRemovalManager} from '../api/developer-app-removal.ts'
import {guardNewProjectRecords} from '../api/developer-app-lifecycle.ts'
import {createDeveloperAppRemovalApiHandler} from '../api/developer-app-removal-api.ts'
const id='dev_remove12345678',now=Date.now(),expired=new Date(now-60000).toISOString(),future=new Date(now+60000).toISOString()
const app={id,ownerId:'owner',name:'Example app',capabilities:['hosted_checkout'],keys:[{id:'key',prefix:'hpl_live_test'}],directoryProfile:{enabled:true},webhookUrl:'https://example.test/hooks',webhookSecretCipher:'private',operationalStatus:'active'}
const empty=()=>({checkouts:[],funding:[],executions:[],events:[],outbox:[]})
const checkout={id:'chk_test12345',partnerId:id,expiresAt:expired,paymentAttempts:[]}
assert.deepEqual(reviewAppRemoval(app,empty(),now),{allowed:true,mode:'deleted',blockingReason:'',pending:0,history:0})
for(const record of [{...checkout,expiresAt:future},{...checkout,payment:{status:'processing'}},{...checkout,agenticAttempts:[{signatureHash:'signature'}]},{...checkout,payment:{status:'paid'},settlement:{mode:'ngn'},payout:{status:'processing'}}])assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[record]},now).allowed,false)
for(const status of ['delivered','refunded'])assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[{...checkout,payment:{status:'paid'},settlement:{mode:'ngn'},payout:{status}}]},now).allowed,true)
assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[checkout]},now).mode,'closed')
assert.equal(reviewAppRemoval(app,{...empty(),events:[{projectId:id,recordId:'pruned',product:'checkout'}]},now).allowed,false)
assert.equal(reviewAppRemoval(app,{...empty(),legacyRecords:1},now).allowed,false)
assert.equal(reviewAppRemoval(app,{...empty(),outbox:[{partnerId:id,status:'pending'}]},now).allowed,false)
for(const state of ['prepared','authorized','submitted','processing','needs_review'])assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[checkout],executions:[{ownerId:'partner:'+id,state,resourceId:checkout.id}]},now).allowed,false)
const funding={id:'pmf_test',partnerId:id,checkoutId:checkout.id,expiresAt:expired}
assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[{...checkout,payment:{status:'paid'}}],funding:[funding]},now).allowed,false)
assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[{...checkout,payment:{status:'paid'}}],funding:[{...funding,observation:{status:'funded'}}]},now).allowed,true)
assert.equal(reviewAppRemoval(app,{...empty(),checkouts:[{...checkout,partnerId:'other',expiresAt:future}]},now).allowed,true)
let store={projects:{[id]:structuredClone(app)}},records={},events=[],writes=0,locks=0
const client={query:async(sql,params)=>{
 if(sql.includes('for update')){locks++;return {rows:[{value:structuredClone(store)}]}}
 if(sql.startsWith('select store_key'))return {rows:[{store_key:'hashpaylink:hosted-checkouts:v2',value:{checkouts:records}}]}
 if(sql.startsWith('select count'))return {rows:[{count:0}]}
 if(sql.startsWith('select distinct'))return {rows:events}
 if(sql.startsWith('update render_durable_kv')){writes++;store=JSON.parse(params[1]);return {rows:[]}}
 throw Error('Unexpected query '+sql)
}}
const manage=createAppRemovalManager(async run=>run(client),async()=>{})
await assert.rejects(()=>manage({projectId:id,ownerId:'stranger',confirmName:app.name,remove:true}),{status:404})
await assert.rejects(()=>manage({projectId:id,ownerId:'owner',confirmName:'wrong',remove:true}),{status:400})
records={[checkout.id]:{...checkout,expiresAt:future}}
await assert.rejects(()=>manage({projectId:id,ownerId:'owner',confirmName:app.name,remove:true}),{status:409})
assert.equal(writes,0)
records={[checkout.id]:{...checkout,payment:{status:'paid'}}};events=[{projectId:id,recordId:checkout.id,product:'checkout'}]
const removed=await manage({projectId:id,ownerId:'owner',confirmName:app.name,remove:true})
assert.equal(removed.mode,'closed');assert.ok(store.projects[id].keys[0].revokedAt);assert.equal(store.projects[id].directoryProfile.enabled,false);assert.equal(store.projects[id].webhookUrl,'');assert.equal(store.projects[id].webhookSecretCipher,'');assert.equal(store.projects[id].operations[0].action,'app_closed');assert.ok(store.projects[id].operations[0].createdAt)
assert.equal(records[checkout.id].payment.status,'paid')
assert.equal((await manage({projectId:id,ownerId:'owner',confirmName:app.name,remove:true})).replayed,true);assert.equal(writes,1)
await assert.rejects(()=>guardNewProjectRecords(client,'checkout',{checkouts:{}},{checkouts:{late:{partnerId:id}}}),{status:409})
await guardNewProjectRecords(client,'checkout',{checkouts:{old:{partnerId:id}}},{checkouts:{old:{partnerId:id,payment:{status:'paid'}}}})
assert.ok(locks>=6)
store={projects:{[id]:structuredClone(app)}};records={};events=[]
assert.equal((await manage({projectId:id,ownerId:'owner',confirmName:app.name,remove:true})).mode,'deleted')
function response(){return{statusCode:200,setHeader(){},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}}
let received
const handler=createDeveloperAppRemovalApiHandler(async(token,scope)=>token==='hpl_cli_'+'a'.repeat(64)&&scope==='project:delete'?{projectId:id,ownerId:'owner'}:null,async input=>{received=input;return{ok:true}})
for(const token of ['','hpl_live_example','hpl_app_example']){const res=response();await handler({method:'DELETE',headers:{authorization:'Bearer '+token},body:{confirmName:app.name}},res);assert.equal(res.statusCode,403)}
let res=response();await handler({method:'DELETE',headers:{authorization:'Bearer hpl_cli_'+'a'.repeat(64)},body:{projectId:'other',confirmName:app.name}},res)
assert.equal(res.statusCode,200);assert.equal(received.projectId,id);assert.equal(received.ownerId,'owner');assert.equal(received.remove,true)
res=response();await handler({method:'GET',headers:{authorization:'Bearer hpl_cli_'+'a'.repeat(64)}},res);assert.equal(received.remove,false)
console.log('PASS authoritative pending/refund/funding checks, history retention, ownership, exact-name confirmation, atomic mutation, key revocation, public removal, idempotency, late-creation guard and separate delete authorization.')

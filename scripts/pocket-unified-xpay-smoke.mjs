import {build} from 'esbuild';import fs from 'node:fs';import assert from 'node:assert/strict'
fs.mkdirSync('.codex-temp',{recursive:true})
const bank={id:'bank-1',name:'Fixture',kind:'bank',currency:'NGN',assets:['USDC'],revision:'1'}, stocks={id:'stocks-1',name:'Fixture',kind:'xstocks',currency:'USD',assets:['NVDAx','AAPLx'],revision:'1'}
globalThis.fixture={owner:'merchant',destinations:[bank,stocks],approval:false}
const mocks={
'../privy-circle-link.js':`export const verifiedPrivyUser=async()=>{if(!fixture.owner)throw Object.assign(Error('Sign in'),{status:401});return{userId:fixture.owner}}`,
'../render-durable-store.js':`let store;export const readDurableJson=async()=>structuredClone(store);export const mutateDurableJson=async(k,fn)=>{store=fn(structuredClone(store));return structuredClone(store)}`,
'../ng-pos.js':`export const listPocketUnifiedXPayPosPayments=async(owner,id)=>fixture.payments?.filter(p=>p.owner===owner&&p.checkoutId===id).map(({owner,checkoutId,...p})=>p)||[];export const listPocketXPayPosDestinations=async owner=>owner==='merchant'?fixture.destinations.filter(d=>d.kind==='bank'):[]`,
'./xpay.js':`export const listPocketUnifiedXPayStockPayments=async()=>[];export const listPocketXPayStockDestinations=async owner=>owner==='merchant'?fixture.destinations.filter(d=>d.kind==='xstocks'):[]`,
'./payment-security.js':`export const consumePocketPaymentApproval=async()=>{const yes=fixture.approval;fixture.approval=false;return yes}`}
await build({entryPoints:['api/pocket/unified-xpay.ts'],outfile:'.codex-temp/unified-xpay-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {default:handler}=await import('../.codex-temp/unified-xpay-test.mjs')
const call=async(body,expected=200,get=false)=>{let status=200,result;await handler({method:get?'GET':'POST',body,query:body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){result=b},sendStatus(s){status=s}});assert.equal(status,expected,JSON.stringify(result));return result}
const input={action:'create',key:'fixture-key-00000001',name:'Shop',destinationIds:['bank-1','stocks-1']}
const c=(await call(input)).checkout;assert.equal(c.destinations.length,2);assert.equal((await call(input)).checkout.id,c.id)
await call({...input,name:'Changed'},409);await call({...input,key:'fixture-key-00000002',destinationIds:['foreign']},400)
fixture.destinations[1]={...stocks,assets:['NVDAx','AAPLx','TSLAx']};await call({...input,key:'fixture-key-00000003'},400);fixture.destinations[1]=stocks
fixture.payments=[{id:'payment-1',owner:'merchant',checkoutId:c.id,rail:'stablecoins',amount:'1000',asset:'NGN',state:'successful',createdAt:1,network:'base'},{id:'other-qr',owner:'merchant',checkoutId:'another',rail:'xstocks',amount:'1',asset:'NVDAx',state:'pending',createdAt:2,network:'xlayer'}];assert.deepEqual((await call({action:'history',id:c.id})).payments.map(p=>p.id),['payment-1']);
fixture.owner='intruder';await call({action:'history',id:c.id},404);await call({action:'delete',id:c.id},404);await call(input,400)
fixture.owner=null;await call({action:'mine'},401)
const publicResult=await call({id:c.id},200,true);assert.equal(publicResult.checkout.owner,undefined);assert.equal(publicResult.checkout.key,undefined)
fixture.destinations[1]={...stocks,revision:'2'};await call({id:c.id},409,true);fixture.destinations[1]=stocks
fixture.owner='merchant';await call({action:'delete',id:c.id},403);fixture.approval=true;await call({action:'delete',id:c.id});await call({id:c.id},404,true)
assert.equal((await call({action:'mine'})).checkouts.length,0)
assert.equal((await call({action:'history',id:c.id})).payments.length,1)
console.log('PASS unified QR: ownership, three assets, replay, public privacy, changed destination, authenticated deletion and legacy destination preservation.')

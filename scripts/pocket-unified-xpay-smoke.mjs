import {build} from 'esbuild';import fs from 'node:fs';import assert from 'node:assert/strict'
fs.mkdirSync('.codex-temp',{recursive:true})
const bank={id:'bank-1',name:'Fixture',kind:'bank',currency:'NGN',assets:['USDC'],revision:'1'}, stocks={id:'stocks-1',name:'Fixture',kind:'xstocks',currency:'USD',assets:['NVDAx','AAPLx'],revision:'1'}
globalThis.fixture={owner:'merchant',destinations:[bank,stocks],approval:false}
const mocks={
'./kyc-level.js':`export const requirePocketBasicKyc=async()=>{if(!fixture.kyc)throw Object.assign(Error('Complete Basic verification.'),{status:403,code:'KYC_BASIC_REQUIRED'})}`,
'../privy-circle-link.js':`export const verifiedPrivyUser=async()=>{if(!fixture.owner)throw Object.assign(Error('Sign in'),{status:401});return{userId:fixture.owner}}`,
'../render-durable-store.js':`const stores=new Map();export const readDurableJson=async(k)=>structuredClone(stores.get(k));export const mutateDurableJson=async(k,fn)=>{const store=fn(structuredClone(stores.get(k)));stores.set(k,store);return structuredClone(store)}`,
'../ng-pos.js':`export const ownedPosSetupKeys=async()=>fixture.keys||{};export const ownedPosSetupKey=async(owner,id)=>fixture.keys?.[id];export const ownsPocketPosQr=async(owner,id)=>owner==='merchant'&&id==='bank-1';export const listPocketUnifiedXPayPosPayments=async(owner,id)=>fixture.payments?.filter(p=>p.owner===owner&&(!id||p.checkoutId===id)).map(({owner,checkoutId,...p})=>p)||[];export const listPocketXPayPosDestinations=async owner=>owner==='merchant'?fixture.destinations.filter(d=>d.kind==='bank'):[]`,
'./xpay.js':`export const ownedStockSetupKeys=async()=>fixture.keys||{};export const ownedStockSetupKey=async(owner,id)=>fixture.keys?.[id];export const listPocketUnifiedXPayStockPayments=async()=>[];export const listPocketXPayStockDestinations=async owner=>owner==='merchant'?fixture.destinations.filter(d=>d.kind==='xstocks'):[]`,
'./payment-security.js':`export const consumePocketPaymentApproval=async()=>{const yes=fixture.approval;fixture.approval=false;return yes}`}
await build({stdin:{contents:"export {default} from './api/pocket/unified-xpay';export {assertUnifiedXPayDestination,legacyXPayTerminal} from './api/pocket/unified-xpay-store'",resolveDir:process.cwd(),loader:'ts'},outfile:'.codex-temp/unified-xpay-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {default:handler,assertUnifiedXPayDestination,legacyXPayTerminal}=await import('../.codex-temp/unified-xpay-test.mjs')
const call=async(body,expected=200,get=false)=>{let status=200,result;await handler({method:get?'GET':'POST',body,query:body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){result=b},sendStatus(s){status=s}});assert.equal(status,expected,JSON.stringify(result));return result}
const input={action:'create',key:'fixture-key-00000001',name:'Shop A'}
await call({...input,destinationIds:['bank-1','stocks-1']},400)
const a=(await call(input)).checkout;assert.equal(a.destinations.length,0);assert.equal((await call(input)).checkout.id,a.id)
await call({...input,name:'Changed'},409);await call({id:a.id},409,true)
const b=(await call({...input,key:'fixture-key-00000002',name:'Shop B'})).checkout
const gatedSetup=await call({action:'begin-setup',id:a.id,kind:'bank'},403);assert.equal(gatedSetup.code,'KYC_BASIC_REQUIRED');await call({action:'begin-setup',id:b.id,kind:'wallet'});fixture.kyc=true;
const setupA=await call({action:'begin-setup',id:a.id,kind:'bank'}),setupB=await call({action:'begin-setup',id:b.id,kind:'wallet'})
fixture.keys={'bank-1':setupA.key,'stocks-1':setupB.key}
const config=(id,version,destinationIds)=>({action:'configure',id,version,destinationIds})
await call(config(a.id,0,['bank-1']),403)
fixture.approval=true;await call(config(a.id,0,['stocks-1']),409)
fixture.approval=true;const configured=(await call(config(a.id,0,['bank-1']))).checkout;assert.equal(configured.id,a.id);assert.equal(configured.version,1)
fixture.approval=true;await call(config(b.id,0,['bank-1']),409)
await call({action:'adopt',destinationId:'stocks-1'},409)
fixture.approval=true;await call(config(b.id,0,['stocks-1']))
assert.equal((await call({id:a.id},200,true)).checkout.destinations[0].id,'bank-1')
assert.equal((await call({id:b.id},200,true)).checkout.destinations[0].id,'stocks-1')
fixture.approval=true;await call(config(a.id,0,[]),409)
const newBank={...bank,id:'bank-new',revision:'2'};fixture.destinations.push(newBank)
const replacement=await call({action:'begin-setup',id:a.id,kind:'bank'});fixture.keys['bank-new']=replacement.key
fixture.approval=true;const changed=(await call(config(a.id,1,['bank-new']))).checkout;assert.equal(changed.id,a.id)
assert.equal((await call({id:b.id},200,true)).checkout.destinations[0].id,'stocks-1')
await assert.rejects(assertUnifiedXPayDestination(a.id,'bank-1','1'),/not available/)
await assertUnifiedXPayDestination(a.id,'bank-1','1',true)
await assert.rejects(assertUnifiedXPayDestination(a.id,'bank-1','wrong',true),/not available/)
assert.ok(!(await call({action:'mine'})).standaloneIds.includes('bank-1'))
fixture.approval=true;await call(config(b.id,1,['bank-1']),409)
fixture.payments=[{id:'payment-a',owner:'merchant',checkoutId:a.id,rail:'stablecoins',amount:'1000',asset:'NGN',state:'successful',createdAt:1,network:'base'},{id:'payment-b',owner:'merchant',checkoutId:b.id,rail:'stablecoins',amount:'2000',asset:'NGN',state:'successful',createdAt:2,network:'base'}]
assert.deepEqual((await call({action:'history',id:a.id})).payments.map(p=>p.id),['payment-a'])
fixture.approval=true;await call(config(a.id,2,[]));await call({id:a.id},409,true)
assert.equal((await call({action:'history',id:a.id})).payments.length,1)
fixture.owner='intruder';await call({action:'configure',id:a.id},404);await call({action:'history',id:a.id},404);await call({action:'begin-setup',id:a.id,kind:'bank'},404)
fixture.owner='merchant';await call({action:'delete',id:a.id},403);fixture.approval=true;await call({action:'delete',id:a.id});await call({id:a.id},404,true)
await assertUnifiedXPayDestination(a.id,'bank-1','1',true)
fixture.destinations.push({...bank,id:'legacy',name:'Legacy business'})
const legacy=(await call({action:'adopt',destinationId:'legacy'})).checkout;assert.equal(legacy.destinations.length,1);assert.equal((await call({action:'adopt',destinationId:'legacy'})).checkout.id,legacy.id)
fixture.approval=true;await call(config(b.id,1,['legacy']),409)
await call({action:'bank-delete',id:'bank-1'},403);fixture.approval=true;await call({action:'bank-delete',id:'bank-1'})
console.log('PASS separate terminals, no QR merging, dedicated setup ownership, PIN protection, version conflicts, stable QR updates, history isolation and in-flight destination preservation.')

assert.equal(await legacyXPayTerminal('legacy'),legacy.id)
assert.equal(await legacyXPayTerminal('bank-1'),a.id)
console.log('PASS legacy QR alias is single-business only.')

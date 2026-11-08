import assert from 'node:assert/strict'
import {createCheckoutSelectionHandler} from '../api/checkout-selection.ts'
import {checkoutSelectionChildPolicy} from '../api/checkout-selection-policy.ts'
import {assertCashCheckoutPayer} from '../api/checkout-cash-policy.ts'
const merchant='0x'+'2'.repeat(40),address='0x'+'1'.repeat(40)
let store={sessions:{},keys:{}},calls=0,owner='payer',authenticated=true
const policy={partnerId:'dev_cash',environment:'live',checkoutMode:'human',settlementMode:'ngn',projectManaged:true,capabilities:['hosted_checkout'],merchantName:'Merchant',allowedOrigins:['https://store.test'],defaultNetwork:'base',paymentOptions:[{network:'base',recipient:merchant}],stablecoinPaymentOptions:[{network:'base',recipient:merchant}],payerOptions:[{network:'base',asset:'USDC'},{network:'base',asset:'USDT'}],nairaSettlement:{refundAddress:merchant}}
const handler=createCheckoutSelectionHandler(async(p,r,recoverOnly)=>{if(!recoverOnly)calls++;assert.equal(r.choice.network,'base');assert.equal(r.choice.asset,'USDC');const child=checkoutSelectionChildPolicy(p,r);assert.equal(child.nairaSettlement.refundAddress,address);return {checkoutId:'chk_cash123456',checkoutUrl:'/pay/c/chk_cash123456'}},{ready:()=>true,secret:()=> 's'.repeat(40),read:async()=>structuredClone(store),mutate:async f=>(store=f(structuredClone(store))),policy:async()=>policy,currentPolicy:async()=>policy,cashPayer:async()=>{if(!authenticated)throw Error('Sign in');return {owner,address}}})
async function request(method,body,query={},key='cash-checkout-test-0001'){let code=200,data;await handler({method,body,query,headers:{'idempotency-key':key}},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return {code,data}}
const created=await request('POST',{amount:'2000',currency:'NGN',returnUrl:'https://store.test/order'})
assert.equal(created.code,201);assert.deepEqual(created.data.checkout.paymentMethods,['stablecoins','cash_balance'])
const id=created.data.checkoutId,q={id,action:'select-payment'},cash={network:'base',asset:'USDC',paymentMethod:'cash_balance'}
authenticated=false;assert.equal((await request('POST',cash,q)).code,409);assert.equal(calls,0);authenticated=true
for(const patch of [{network:'arc'},{asset:'USDT'},{paymentMethod:'fake'}])assert.equal((await request('POST',{...cash,...patch},q)).code,409)
const selected=await request('POST',{...cash,address:merchant},q)
assert.equal(selected.code,200,JSON.stringify(selected));assert.equal(selected.data.checkout.paymentMethod,'cash_balance');assert.equal(calls,1)
assert.ok(!JSON.stringify(selected.data).includes(address));assert.ok(!JSON.stringify(selected.data).includes('"owner"'))
assert.equal((await request('POST',cash,q)).code,200);assert.equal(calls,1)
owner='other';assert.equal((await request('POST',cash,q)).code,409);owner='payer'
assert.equal((await request('POST',{network:'base',asset:'USDC'},q)).code,409)
const record=store.sessions[id];assertCashCheckoutPayer(record,'base','USDC',address.toUpperCase())
for(const [chain,asset,payer] of [['arc','USDC',address],['base','USDT',address],['base','USDC',merchant]])assert.throws(()=>assertCashCheckoutPayer(record,chain,asset,payer))
store.sessions[id].cashPayer.address=merchant;assert.equal((await request('GET',{}, {id})).code,404)
console.log('PASS cash: authenticated payer, NGN/Base/USDC scope, immutable ownership, payer refunds, replay, untrusted address ignored, private binding and signature tamper rejection. No live calls.')

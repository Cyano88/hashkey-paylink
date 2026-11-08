import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import {createCheckoutSelectionHandler,claimCheckoutSelectionPayment} from '../api/checkout-selection.ts';import {checkoutSelectionChildPolicy} from '../api/checkout-selection-policy.ts';import {checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts';
const refund='0x'+'1'.repeat(40),merchant='0x'+'2'.repeat(40),payer='0x'+'3'.repeat(40),secret='s'.repeat(40);
let store={sessions:{},keys:{}},calls=[],bankCalls=0;
const policy={partnerId:'dev_methods',environment:'live',checkoutMode:'human',settlementMode:'ngn',capabilities:['hosted_checkout'],merchantName:'Merchant',allowedOrigins:['https://store.test'],defaultNetwork:'base',paymentOptions:[{network:'base',recipient:refund}],stablecoinPaymentOptions:['base','arc','arbitrum','polygon','ethereum','solana'].map(network=>({network,recipient:merchant})),nairaSettlement:{refundAddress:refund},bscCheckout:{recipient:merchant,assets:checkoutStablecoins('bsc').map(a=>a.address.toLowerCase())},xlayerCheckout:{recipient:merchant,assets:checkoutStablecoins('xlayer').map(a=>a.address.toLowerCase())}};
const deps={now:Date.now,ready:()=>true,secret:()=>secret,read:async()=>structuredClone(store),mutate:async f=>(store=f(structuredClone(store))),policy:async()=>policy,currentPolicy:async()=>policy,enabled:()=>true,cashPayer:async()=>({owner:'payer',address:payer})};
const h=createCheckoutSelectionHandler(async(p,r)=>{const child=checkoutSelectionChildPolicy(p,r);calls.push(child);if(child.settlementMode==='ngn')bankCalls++;const id='chk_method'+calls.length+'12345678';return {checkoutId:id,checkoutUrl:'/pay/c/'+id}},deps);
async function req(method,body={},query={},key='method-separation-test-001'){let code=200,data;await h({method,body,query,headers:{'idempotency-key':key}},{setHeader(){},status(n){code=n;return this},json(d){data=d;return this},sendStatus(n){code=n}});return {code,data}}
const create=key=>req('POST',{currency:'NGN',amount:'2000',returnUrl:'https://store.test/order'},{},key);
for(const network of ['base','arc','arbitrum','polygon','ethereum','solana','bsc','xlayer']){
 const made=await create('method-route-'+network+'-0001');assert.equal(made.code,201,JSON.stringify(made));const asset=network==='arc'?'USDC':'USDT';assert(made.data.checkout.options.some(o=>o.network===network&&o.asset===asset&&!o.unavailableReason));
 const selected=await req('POST',{network,asset},{id:made.data.checkoutId,action:'select-payment'});assert.equal(selected.code,200,JSON.stringify(selected));const child=calls.at(-1);assert.equal(child.settlementMode,'usdc');assert.equal(child.nairaSettlement,undefined);assert.equal(child.defaultNetwork,network);if(!['bsc','xlayer'].includes(network))assert.deepEqual(child.paymentOptions,[{network,recipient:merchant}]);else assert.equal(child[network==='bsc'?'bscCheckout':'xlayerCheckout'].recipient,merchant);
}
assert.equal(bankCalls,0,'Stablecoin routing must never prepare a bank payout');
const cashMade=await create('method-cash-switch-0001'),id=cashMade.data.checkoutId,q={id,action:'select-payment'};
const stable=await req('POST',{network:'polygon',asset:'USDT'},q),old=stable.data.selectedCheckoutId;
const cash=await req('POST',{network:'base',asset:'USDC',paymentMethod:'cash_balance',expectedCheckoutId:old},q);assert.equal(cash.code,200,JSON.stringify(cash));assert.equal(cash.data.settlementMode,'ngn');assert.equal(cash.data.checkout.paymentMethod,'cash_balance');assert.equal(calls.at(-1).nairaSettlement.refundAddress,payer);assert.equal(bankCalls,1);
// Round trips keep the order and immutable cash child, and retire each inactive child.
const cashId=cash.data.selectedCheckoutId;
for(const network of ['base','arc','arbitrum','polygon','ethereum','solana','bsc','xlayer']){
 const switched=await req('POST',{network,asset:'USDC',paymentMethod:'stablecoins',expectedCheckoutId:cashId},q);
 assert.equal(switched.code,200,JSON.stringify(switched));assert.equal(switched.data.checkoutId,id);assert.equal(switched.data.settlementMode,'usdc');assert.equal(switched.data.checkout.paymentMethod,'stablecoins');
 await assert.rejects(()=>claimCheckoutSelectionPayment(cashId,deps),/changed/);
 const restored=await req('POST',{network:'base',asset:'USDC',paymentMethod:'cash_balance',expectedCheckoutId:switched.data.selectedCheckoutId},q);
 assert.equal(restored.code,200,JSON.stringify(restored));assert.equal(restored.data.selectedCheckoutId,cashId);assert.equal(restored.data.checkout.canChange,true);
 await assert.rejects(()=>claimCheckoutSelectionPayment(switched.data.selectedCheckoutId,deps),/changed/);
}
assert.equal(bankCalls,1,'Switching back to cash must reuse the provider order');
await assert.rejects(()=>claimCheckoutSelectionPayment(old,deps),/changed/);await claimCheckoutSelectionPayment(cash.data.selectedCheckoutId,deps);
assert.equal((await req('POST',{network:'base',asset:'USDC',paymentMethod:'cash_balance'},q)).code,200);assert.equal(bankCalls,1);assert.equal((await req('POST',{network:'polygon',asset:'USDT'},q)).code,409);
// A second account cannot take over cash-bound orders, including while cash is inactive.
const isolated=await create('method-owner-test-0001'),oq={id:isolated.data.checkoutId,action:'select-payment'};
const owned=await req('POST',{network:'base',asset:'USDC',paymentMethod:'cash_balance'},oq);
const wrong=createCheckoutSelectionHandler(async()=>{throw Error('Must not create a child')},{...deps,cashPayer:async()=>({owner:'other',address:merchant})});
let wrongCode=200;await wrong({method:'POST',body:{network:'base',asset:'USDC',paymentMethod:'stablecoins',expectedCheckoutId:owned.data.selectedCheckoutId},query:oq,headers:{}},{setHeader(){},status(n){wrongCode=n;return this},json(){return this}});assert.equal(wrongCode,409);
// Unknown bank preparation outcomes remain reserved; retry is recovery-only, not a new bank order.
const uncertain=await create('method-uncertain-0001'),uq={id:uncertain.data.checkoutId,action:'select-payment'};let attempts=[];
const fails=createCheckoutSelectionHandler(async(p,r,recover)=>{attempts.push(recover);throw Error('provider timeout')},deps);
async function failSelect(body){let code=200;await fails({method:'POST',body,query:uq,headers:{}},{setHeader(){},status(n){code=n;return this},json(){return this}});return code}
const cashBody={network:'base',asset:'USDC',paymentMethod:'cash_balance'};
assert.equal(await failSelect(cashBody),409);assert.equal(await failSelect(cashBody),409);assert.deepEqual(attempts,[false,true]);assert.equal(await failSelect({network:'polygon',asset:'USDT'}),409);assert.equal(attempts.length,2);
policy.stablecoinPaymentOptions=[];delete policy.bscCheckout;delete policy.xlayerCheckout;
const only=await create('method-no-wallets-0001');assert.deepEqual(only.data.checkout.options,[]);assert.deepEqual(only.data.checkout.paymentMethods,['cash_balance']);assert.equal((await req('POST',{network:'base',asset:'USDC'},{id:only.data.checkoutId,action:'select-payment'})).code,409,'Refund address must never be used as a merchant wallet');assert.equal((await req('POST',{network:'base',asset:'USDC',paymentMethod:'cash_balance'},{id:only.data.checkoutId,action:'select-payment'})).code,200);
// Historical bank sessions keep their original signature and bank routing.
const legacy={id:'chks_'+'f'.repeat(24),defaultNetwork:'base',projectId:policy.partnerId,amount:'2000',title:'Legacy order',merchantName:'Merchant',returnUrl:'https://store.test/order',expiresAt:new Date(Date.now()+600000).toISOString(),options:[{network:'base',asset:'USDC',recipient:refund}],requestHash:'legacy',currency:'NGN',settlementMode:'ngn',integrity:''};
legacy.integrity=createHmac('sha256',secret).update(JSON.stringify([legacy.id,legacy.defaultNetwork,legacy.projectId,legacy.amount,legacy.title,legacy.merchantName,'',legacy.returnUrl,legacy.expiresAt,legacy.options.map(o=>[o.network,o.asset,o.recipient]),legacy.requestHash,null,'','',legacy.currency,legacy.settlementMode,[''],false])).digest('hex');store.sessions[legacy.id]=legacy;
assert.equal((await req('GET',{}, {id:legacy.id})).code,200);const oldBank=await req('POST',{network:'base',asset:'USDC'},{id:legacy.id,action:'select-payment'});assert.equal(oldBank.code,200,JSON.stringify(oldBank));assert.equal(calls.at(-1).settlementMode,'ngn');assert.equal(calls.at(-1).nairaSettlement.refundAddress,refund);
console.log('PASS method settlement: eight wallet networks, no bank calls for stablecoins, cash payer refunds, stable-to-cash switch, old-child lockout, replay, no refund-address fallback, bank-only merchant, legacy signature and bank routing. No live transfers.');


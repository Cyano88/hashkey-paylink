import assert from 'node:assert/strict'
import {createCheckoutSelectionHandler} from '../api/checkout-selection.ts'
import {checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts'
const recipient='0x2222222222222222222222222222222222222222'
let now=Date.now(),store={sessions:{},keys:{}},count=0,enabled=true
const policy={partnerId:'dev_test',ownerId:'user',environment:'live',checkoutMode:'human',settlementMode:'usdc',projectManaged:true,capabilities:['hosted_checkout'],merchantName:'Test',allowedOrigins:['https://store.test'],defaultNetwork:'base',paymentOptions:['base','arc','arbitrum','solana','ethereum','polygon'].map(network=>({network,recipient})),bscCheckout:{recipient,assets:checkoutStablecoins('bsc').map(a=>a.address.toLowerCase())},xlayerCheckout:{recipient,assets:checkoutStablecoins('xlayer').map(a=>a.address.toLowerCase())}}
const handler=createCheckoutSelectionHandler(async(p,r)=>{count++;assert.ok(r.choice);assert.equal(p.partnerId,policy.partnerId);return {checkoutId:'chk_1234567890',checkoutUrl:'/pay/c/chk_1234567890?attempt=pat_1234567890'}},{ready:()=>true,secret:()=> 's'.repeat(32),now:()=>now,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},policy:async()=>policy,currentPolicy:async()=>enabled?policy:null,enabled:()=>true})
async function request(method,body={},query={},key='selection-test-key-001'){let code=200,data;await handler({method,body,query,headers:{'idempotency-key':key}},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return {code,data}}
const body={amount:'1.5',returnUrl:'https://store.test/order',title:'Order',paymentSelection:'stablecoins'}
const created=await request('POST',body);assert.equal(created.code,201,JSON.stringify(created));const id=created.data.checkoutId
const opts=created.data.checkout.options
assert.equal(opts.length,17);assert.equal(opts.filter(o=>o.network==='arc').length,1)
assert.deepEqual(opts.filter(o=>o.network==='xlayer').map(o=>o.asset),['USDC','USDT','USDe','USDG'])
assert.ok(!JSON.stringify(created.data).includes(recipient),'Public session must not expose recipient configuration')
assert.equal((await request('POST',body)).data.checkoutId,id)
assert.equal((await request('POST',{...body,amount:'2'})).code,409)
assert.equal((await request('POST',{...body,asset:'USDC'},{},'fixed-asset-forbidden')).code,409)
assert.equal((await request('POST',{asset:'USDT',network:'arc'},{id,action:'select-payment'})).code,409)
assert.equal(count,0)
const chosen=await request('POST',{asset:'USDe',network:'xlayer'},{id,action:'select-payment'})
assert.equal(chosen.code,200,JSON.stringify(chosen));assert.match(chosen.data.selectedCheckoutUrl,/chk_1234567890/)
assert.equal((await request('POST',{asset:'USDT',network:'base'},{id,action:'select-payment'})).data.selectedCheckoutId,'chk_1234567890','Reopen the existing attempt; never create a second payment')
assert.equal(count,1)
const second=await request('POST',body,{},'selection-test-key-002');now+=16*60000
assert.equal((await request('GET',{}, {id:second.data.checkoutId})).code,410)
assert.equal((await request('GET',{}, {id:second.data.checkoutId,purpose:'status'})).data.status,'expired')
assert.equal((await request('GET',{}, {id})).data.selectedCheckoutId,'chk_1234567890','Selected payments remain recoverable after expiry')
store.sessions[id].amount='100';assert.equal((await request('GET',{}, {id})).code,404)
console.log('PASS selection API: 17 supported options, immutable retry, asset restrictions, signed state, single attempt, expiry and recovery.')
const raced=await request('POST',body,{},'selection-test-key-race')
const before=count
const race=await Promise.all([request('POST',{network:'base',asset:'USDC'},{id:raced.data.checkoutId,action:'select-payment'}),request('POST',{network:'xlayer',asset:'USDG'},{id:raced.data.checkoutId,action:'select-payment'})])
assert.equal(race.filter(r=>r.code===200).length,1);assert.equal(race.filter(r=>r.code===409).length,1);assert.equal(count,before+1)
const blocked=await request('POST',body,{},'selection-test-key-disabled');enabled=false
assert.equal((await request('POST',{network:'base',asset:'USDC'},{id:blocked.data.checkoutId,action:'select-payment'})).code,409)
assert.equal(count,before+1)
console.log('PASS concurrent tabs bind one route; disabled projects cannot start a payment.')
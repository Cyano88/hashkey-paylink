import assert from 'node:assert/strict'
import {createCheckoutSelectionHandler,claimCheckoutSelectionPayment,checkoutSelectionNavigation} from '../api/checkout-selection.ts'
import {checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts'
let store={sessions:{},keys:{}},now=Date.now(),calls=0,fail=false,hold
// PostgreSQL JSONB may reorder object keys. Signatures must survive that round trip.
const persisted=value=>Array.isArray(value)?value.map(persisted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort((a,b)=>b.localeCompare(a)).map(key=>[key,persisted(value[key])])):value
const recipient='0x'+'1'.repeat(40)
const policy={partnerId:'dev_test',ownerId:'owner',environment:'live',checkoutMode:'human',settlementMode:'usdc',projectManaged:true,capabilities:['hosted_checkout'],merchantName:'Test',allowedOrigins:['https://store.test'],defaultNetwork:'base',paymentOptions:[{network:'base',recipient},{network:'arbitrum',recipient}],bscCheckout:{recipient,assets:checkoutStablecoins('bsc').map(t=>t.address.toLowerCase())},xlayerCheckout:{recipient,assets:checkoutStablecoins('xlayer').map(t=>t.address.toLowerCase())}}
const d={ready:()=>true,secret:()=> 's'.repeat(32),now:()=>now,read:async()=>structuredClone(store),mutate:async fn=>{store=persisted(fn(structuredClone(store)));return structuredClone(store)},policy:async()=>policy,currentPolicy:async()=>policy,enabled:()=>true}
const children=new Map()
const handler=createCheckoutSelectionHandler(async(p,r)=>{
 calls++;if(hold)await hold;if(fail)throw Error('Provider timeout')
 const key=r.id+':'+r.choice.network+':'+r.choice.asset
 if(!children.has(key)){const id=(r.choice.network==='bsc'?'chkb_':r.choice.network==='xlayer'?'chkx_':'chk_')+String(children.size+1).padStart(24,'0');children.set(key,{checkoutId:id,checkoutUrl:'/pay/c/'+id})}
 return children.get(key)
},d)
async function request(method,body={},query={},key='switch-order-key-0001'){let code=200,data;await handler({method,body,query,headers:{'idempotency-key':key}},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return {code,data}}
async function create(key){const result=await request('POST',{amount:'2.29',returnUrl:'https://store.test/order',paymentSelection:'stablecoins'}, {},key);assert.equal(result.code,201);return result.data.checkoutId}
async function choose(id,network,expectedCheckoutId,asset='USDT'){return request('POST',{network,asset,expectedCheckoutId},{id,action:'select-payment'})}
const id=await create('switch-order-key-0001');let current
for(const network of ['base','bsc','xlayer','bsc','base','xlayer','base']){
 const result=await choose(id,network,current);assert.equal(result.code,200,JSON.stringify(result));current=result.data.selectedCheckoutId
 assert.equal(result.data.checkout.selected.network,network);assert.equal(result.data.checkout.amount,'2.29');assert.equal(result.data.checkout.canChange,true)
 assert.equal((await checkoutSelectionNavigation(current,d)).id,id)
}
assert.equal(children.size,3,'Returning to a route reuses its child, without another invoice')
const previous=current
const switched=await choose(id,'bsc',current);current=switched.data.selectedCheckoutId
await assert.rejects(claimCheckoutSelectionPayment(previous,d),/option changed/,'Old signed quotes cannot authorize after switching')
assert.equal((await choose(id,'xlayer',previous)).code,409,'Stale tab cannot replace a newer choice')
await claimCheckoutSelectionPayment(current,d)
assert.equal((await checkoutSelectionNavigation(current,d)).canChange,false)
assert.equal((await choose(id,'base',current)).code,409,'No switch after signing may have started')
assert.equal((await choose(id,'bsc',current)).code,200,'Current locked payment can be resumed')
const recoverId=await create('switch-order-key-0002');let start=await choose(recoverId,'base')
fail=true;assert.equal((await choose(recoverId,'bsc',start.data.selectedCheckoutId)).code,409);fail=false
assert.equal((await checkoutSelectionNavigation(start.data.selectedCheckoutId,d)).canChange,true,'Failed preparation does not strand the selector')
assert.equal((await choose(recoverId,'xlayer',start.data.selectedCheckoutId)).code,200)
const raceId=await create('switch-order-key-0003');start=await choose(raceId,'base');let release;hold=new Promise(r=>release=r)
const pending=choose(raceId,'bsc',start.data.selectedCheckoutId)
while(!store.sessions[raceId].selecting)await new Promise(r=>setTimeout(r,0))
const reload=await request('GET',{}, {id:raceId})
assert.deepEqual(reload.data.checkout.preparingOption,{network:'bsc',asset:'USDT'},'Reload resumes the in-flight route instead of silently reverting')
assert.equal(reload.data.checkout.canChange,true)
assert.equal((await checkoutSelectionNavigation(start.data.selectedCheckoutId,d)).canChange,true,'Existing child retains a route back to preparation recovery')
await assert.rejects(claimCheckoutSelectionPayment(start.data.selectedCheckoutId,d),/option changed/)
assert.equal((await choose(raceId,'xlayer',start.data.selectedCheckoutId)).code,409)
release();hold=undefined;const won=await pending;assert.equal(won.code,200)
assert.equal((await choose(raceId,'bsc')).data.selectedCheckoutId,won.data.selectedCheckoutId,'Lost response retry recovers the same route')
const oldRecipient=policy.bscCheckout.recipient;policy.bscCheckout.recipient='0x'+'2'.repeat(40)
assert.equal((await choose(recoverId,'bsc',store.sessions[recoverId].checkoutId)).code,409,'Merchant recipient change cannot alter the order')
policy.bscCheckout.recipient=oldRecipient
now+=16*60000;assert.equal((await choose(recoverId,'base',store.sessions[recoverId].checkoutId)).code,409)
store.sessions[raceId].paymentLock=undefined;store.sessions[raceId].routes={tampered:{checkoutId:previous,checkoutUrl:'/pay/c/'+previous}}
assert.equal((await request('GET',{}, {id:raceId})).code,404,'Route and lock metadata are integrity protected')
console.log('PASS Circle/BNB/X Layer both directions, child reuse, stale tabs, stale quote authorization, signing lock, preparation recovery, switch-vs-sign race, recipient changes, expiry and integrity.')

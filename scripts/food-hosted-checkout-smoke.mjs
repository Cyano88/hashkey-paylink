import assert from 'node:assert/strict'
import {createFoodDemoHandler} from '../api/food-demo.ts'
for(const rail of ['circle','bsc','xlayer']){
 let store={orders:{}},calls=[],paid=false,clock=Date.now(),badStatus=false
 const id='a'.repeat(32),checkoutId=rail==='circle'?'chk_12345678':(rail==='bsc'?'chkb_':'chkx_')+'b'.repeat(24)
 const handler=createFoodDemoHandler({selectionEnabled:async()=>false,ready:()=>true,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},now:()=>clock,choices:async()=>{throw Error('New integration must not select provider routes')},call:async(path,body,key)=>{
  if(body){calls.push({body,key});return {ok:true,checkoutId,checkoutUrl:'/pay/c/'+checkoutId,...(rail==='circle'?{}:{checkout:{amount:'1.5',asset:'USDC'}})}}
  return rail==='circle'?{status:paid?'paid':'pending',checkoutId,settlementMode:'usdc',network:'base',payment:{amount:badStatus?'2':'1.5'}}:{status:paid?'paid':'pending',checkout:{id:checkoutId,asset:'USDC',amount:badStatus?'2':'1.5',network:rail}}
 }})
 async function request(method,body={},query={}){let code=200,data;await handler({method,body,query},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return{code,data}}
 if(rail==='xlayer')store.drafts={[id]:{id,lines:[{id:'plantain',name:'Golden plantain',quantity:1,cents:150}],cents:150,createdAt:clock}}
 const body={action:'prepare',requestId:id,items:[{id:'plantain',quantity:1}],amount:'0.01',recipient:'attacker',network:'bsc',rail:'xlayer'}
 const result=await request('POST',rail==='xlayer'?{...body,items:undefined}:body);assert.equal(result.code,200,JSON.stringify(result));assert.equal(result.data.checkoutUrl,'/pay/c/'+checkoutId)
 assert.equal(calls[0].body.expiresInMinutes,15);assert.equal(calls[0].body.amount,'1.5');assert.equal(calls[0].body.asset,'USDC');assert.equal(calls[0].body.kind,'service')
 for(const field of ['rail','network','recipient','paymentOptions','brandImageUrl'])assert.equal(calls[0].body[field],undefined)
 // JSONB storage may reorder object keys while preserving the basket.
 store.orders[id].lines=store.orders[id].lines.map(({id,name,quantity,cents})=>({cents,quantity,name,id}))
 assert.equal((await request('POST',body)).code,200);assert.equal(calls.length,1)
 assert.equal((await request('POST',{action:'prepare',requestId:id})).data.checkoutUrl,result.data.checkoutUrl)
 assert.equal((await request('POST',{...body,items:[{id:'wrap',quantity:1}]})).code,400)
 assert.equal((await request('GET',{}, {id,paid:'true'})).data.order.status,'pending')
 paid=true;badStatus=true;assert.equal((await request('GET',{}, {id})).data.order.status,'pending')
 badStatus=false;const receipt=(await request('GET',{}, {id})).data.order;assert.equal(receipt.status,'paid');assert.equal(receipt.network,rail==='circle'?'base':rail)
 clock+=26*60_000;assert.equal((await request('POST',{action:'prepare',requestId:id})).data.checkoutUrl,result.data.checkoutUrl)
 assert.equal(calls.length,1)
}
console.log('PASS hosted merchant integration: server basket, no route/recipient overrides, default Circle/BNB/X Layer response handling, retries and exact authoritative settlement.')

// The demo opts in to the public selection API; it never builds asset routes itself.
let selectionStore={orders:{}},selectionBody,selectionState='pending'
const sessionId='chks_'+'c'.repeat(24),orderId='d'.repeat(32)
const selectionHandler=createFoodDemoHandler({selectionEnabled:async()=>true,ready:()=>true,read:async()=>structuredClone(selectionStore),mutate:async fn=>{selectionStore=fn(structuredClone(selectionStore));return structuredClone(selectionStore)},call:async(path,body)=>{if(body){selectionBody=body;return {ok:true,checkoutId:sessionId,checkoutUrl:'/pay/c/'+sessionId,checkout:{amount:'1.5'}}}return {ok:true,checkoutId:sessionId,status:selectionState,asset:'USDG',network:'xlayer',settlementMode:'usdc',payment:{amount:'1.5',receiptId:'receipt-fixture-123'}}}})
async function selectionRequest(method,body={},query={}){let code=200,data;await selectionHandler({method,body,query},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return {code,data}}
assert.equal((await selectionRequest('POST',{action:'prepare',requestId:orderId,items:[{id:'plantain',quantity:1}]})).code,200)
assert.equal(selectionBody.paymentSelection,'stablecoins');assert.equal(selectionBody.asset,undefined)
selectionState='expired';assert.equal((await selectionRequest('GET',{}, {id:orderId})).data.order.status,'expired')
selectionState='paid';const selectedReceipt=(await selectionRequest('GET',{}, {id:orderId})).data.order
assert.equal(selectedReceipt.receiptUrl,'/receipt/receipt-fixture-123');assert.equal(selectedReceipt.status,'paid');assert.equal(selectedReceipt.asset,'USDG');assert.equal(selectedReceipt.network,'xlayer')
 delete selectionStore.orders[orderId].receiptId;selectionState='pending'
 assert.equal((await selectionRequest('GET',{}, {id:orderId})).data.order.status,'paid','Receipt backfill must not regress an already confirmed order')
 selectionState='paid'
 assert.equal((await selectionRequest('GET',{}, {id:orderId})).data.order.receiptUrl,'/receipt/receipt-fixture-123','Older paid orders recover their receipt link')
console.log('PASS merchant selection session: no fixed asset, truthful expiry and verified selected-asset receipt.')

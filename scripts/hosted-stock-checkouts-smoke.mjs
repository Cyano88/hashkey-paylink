import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {parseUnits} from 'viem'
import {currentXLayerCheckoutConfig,normalizeXLayerCheckoutConfig,xlayerCheckoutAssets} from '../src/lib/xlayerCheckoutConfig.ts'
import {createHostedStockCheckoutsHandler,readStockCheckoutBranding,readStockCheckoutReceipt,readStockCheckout,settleStockCheckout,drainStockCheckoutWebhooks,assertStockCheckoutPayable} from '../api/hosted-stock-checkouts.ts'
import {createPaymentExecutionRepository} from '../api/pocket/payment-execution-intents.ts'
import {stockAssets,stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.ts'
const root=await mkdtemp(join(tmpdir(),'stock-checkout-'))
try{for(const asset of xlayerCheckoutAssets){
 const recipient='0x'+'2'.repeat(40),payer='0x'+'1'.repeat(40)
 let clock=Date.parse('2026-10-06T12:00:00Z'),seq=0,enabled=true,store={checkouts:{},idempotency:{},outbox:{}},notifications=[],failDelivery=true
 let policy={projectManaged:true,partnerId:'dev_stocktest0001',ownerId:'merchant',merchantName:'Fixture merchant',brandImageUrl:asset.symbol==='USDC'?'https://merchant.example/logo.png':undefined,environment:'live',checkoutMode:'human',settlementMode:'usdc',allowedOrigins:['https://merchant.example'],capabilities:['hosted_checkout'],xlayerCheckout:{recipient,assets:[asset.address.toLowerCase()]}}
 assert.deepEqual(currentXLayerCheckoutConfig({recipient,assets:[stockAssets[0].address.toLowerCase(),asset.address.toLowerCase()]}).assets,[asset.address.toLowerCase()])
 assert.equal(currentXLayerCheckoutConfig({recipient,assets:[stockAssets[0].address.toLowerCase()]}),undefined)
 assert.throws(()=>normalizeXLayerCheckoutConfig({recipient,assets:[stockAssets[0].address]}),/stablecoins only/)
 await assert.rejects(assertStockCheckoutPayable({token:{address:stockAssets[0].address}}),/no longer accepted/)
 await assert.rejects(assertStockCheckoutPayable({token:{address:asset.address}},true),/Swap in Pocket/)
 const executions=createPaymentExecutionRepository({storePath:join(root,asset.symbol+'-executions.json'),durable:false,isRender:false})
 const d={enabled:()=>enabled,secret:()=> 'test-secret-'.repeat(4),hasStore:()=>true,read:async()=>structuredClone(store),mutate:async fn=>{const next=await fn(structuredClone(store));store=next;return structuredClone(store)},policy:async()=>policy,asset:async address=>({chainId:196,address,symbol:asset.symbol,decimals:asset.decimals}),price:async()=>1,executions,notify:async(...args)=>{notifications.push(args);if(failDelivery)throw Error('offline');return{status:'sent'}},now:()=>clock,id:()=> 'chkx_'+String(++seq).padStart(24,'0')}
 const handler=createHostedStockCheckoutsHandler(d)
 const call=async(method,body={},query={},key='stock-checkout-order-001')=>{let status=200,data;await handler({method,body,query,headers:{'idempotency-key':key}},{setHeader(){},status(n){status=n;return this},json(d){data=d;return this},sendStatus(n){status=n}});return{status,data}}
 const body={rail:'xlayer',asset:asset.symbol,amount:'0.000001',returnUrl:'https://merchant.example/paid'}
 assert.equal((await call('POST',{...body,environment:'test'})).status,409)
 enabled=false;assert.equal((await call('POST',body)).status,503);enabled=true
 assert.equal((await call('POST',{...body,swap:true})).status,400)
 for(const rejected of [stockAssets[0].symbol,stockAssets[0].address,'ETH','SOL','BNB','OKB'])assert.equal((await call('POST',{...body,asset:rejected})).status,400)
 assert.equal((await call('POST',{...body,recipient})).status,400)
 assert.equal((await call('POST',{...body,amount:1})).status,400)
 assert.equal((await call('POST',{...body,kind:'funding'})).status,400)
 assert.equal((await call('POST',{...body,providerFunding:{provider:'polymarket'}})).status,400)
 assert.equal((await call('POST',{...body,asset:'NOT_ALLOWED'})).status,400)
 assert.equal((await call('POST',{...body,amount:'0.'+'0'.repeat(asset.decimals)+'1'})).status,400)
 assert.equal((await call('POST',{...body,returnUrl:'https://other.example/paid'})).status,400)
 const made=await call('POST',body);assert.equal(made.status,201,JSON.stringify(made.data));const id=made.data.checkoutId
 assert.equal(Date.parse(made.data.checkout.expiresAt)-clock,15*60_000)
 assert.equal(made.data.checkout.brandImageUrl,policy.brandImageUrl)
 assert.deepEqual(await readStockCheckoutBranding([id,id,'unknown'],d),{[id]:{merchantName:policy.merchantName,merchantImageUrl:policy.brandImageUrl}})
 const brandOriginal=store.checkouts[id].merchantName;store.checkouts[id].merchantName='Tampered';assert.deepEqual(await readStockCheckoutBranding([id],d),{});store.checkouts[id].merchantName=brandOriginal

 if(policy.brandImageUrl){store.checkouts[id].brandImageUrl='https://merchant.example/changed.png';assert.equal(await readStockCheckout(id,false,d),null);store.checkouts[id].brandImageUrl=policy.brandImageUrl}
 assert.equal((await call('POST',body)).data.checkoutId,id)
 assert.equal((await call('POST',{...body,amount:'1'})).status,409)
 const execution=await executions.findByResource('partner:'+policy.partnerId,id,'hosted_checkout')
 assert.equal(execution.asset,asset.symbol);assert.equal(execution.amount,body.amount);assert.equal(execution.state,'prepared')
 const original=store.checkouts[id].amount;store.checkouts[id].amount='3';assert.equal(await readStockCheckout(id,true,d),null);store.checkouts[id].amount=original
 const owner=policy;policy={...owner,partnerId:'dev_anotherproject'};assert.equal((await call('GET',{}, {id,purpose:'status'})).status,403);policy=owner
 const proof={id,token:asset.address,units:String(parseUnits(body.amount,asset.decimals)),recipient,payer,hash:'0x'+'a'.repeat(64),confirmedAt:new Date(clock+1000).toISOString(),paymentId:'fixture-payment'}
 await assert.rejects(settleStockCheckout({...proof,payer:'invalid'},d),/does not match/)
 await assert.rejects(settleStockCheckout({...proof,units:'not-a-number'},d),/does not match/)
 await assert.rejects(settleStockCheckout({...proof,units:'2'},d),/does not match/)
 await assert.rejects(settleStockCheckout({...proof,recipient:payer},d),/does not match/)
 await assert.rejects(settleStockCheckout({...proof,confirmedAt:new Date(clock-1000).toISOString()},d),/outside/)
 assert.equal(await readStockCheckoutReceipt(proof.paymentId,d),undefined)
 assert.equal((await settleStockCheckout(proof,d)).payment.status,'paid')
 const recoveredReceipt=await readStockCheckoutReceipt(proof.paymentId,d);assert.equal(recoveredReceipt.source,'hosted_checkout');assert.equal(recoveredReceipt.amount,body.amount);assert.equal(recoveredReceipt.txHash,proof.hash);assert.equal(recoveredReceipt.recipient,'Fixture merchant');assert.equal(recoveredReceipt.feeAmount,undefined);assert.equal(recoveredReceipt.brandImageUrl,policy.brandImageUrl);assert.equal(recoveredReceipt.brandName,policy.merchantName)
 assert.equal(await readStockCheckoutReceipt('unknown-receipt',d),undefined)
 assert.equal((await executions.get(execution.ownerId,execution.id)).state,'completed')
 assert.equal((await call('GET',{}, {id})).data.returnUrl,body.returnUrl)
 assert.equal((await call('GET',{}, {id,purpose:'status'})).data.status,'paid')
 await settleStockCheckout(proof,d)
 await drainStockCheckoutWebhooks(d);assert.equal(store.outbox[id].delivered,false)
 clock+=60_000;failDelivery=false;await drainStockCheckoutWebhooks(d);assert.equal(store.outbox[id].delivered,true)
 assert.equal(notifications[0][2].asset,asset.symbol);assert.equal(notifications[0][3].eventId,notifications[1][3].eventId)
 assert.equal(notifications[1][2].amount,body.amount)
 policy={...policy,swapPermission:true,capabilities:['hosted_checkout','swap_xlayer']}
 assert.equal((await call('POST',{...body,swap:true},{},'stock-checkout-swap-denied')).status,400)
 const second=await call('POST',body,{},'stock-checkout-order-002');assert.equal(second.status,201);assert.equal(second.data.checkout.swapEnabled,false)
 await assert.rejects(settleStockCheckout({...proof,id:second.data.checkoutId,confirmedAt:new Date(clock+1000).toISOString()},d),/already used/)
 clock+=31*60_000;assert.equal((await call('GET',{}, {id:second.data.checkoutId})).status,410)
 assert.equal((await call('GET',{}, {id})).data.checkout.status,'paid','Paid receipts survive checkout expiry')
 assert.equal((await readStockCheckoutReceipt(proof.paymentId,d)).txHash,proof.hash,'Receipt recovery survives checkout expiry')
 const originalName=store.checkouts[id].merchantName;store.checkouts[id].merchantName='Tampered merchant'
 assert.equal(await readStockCheckoutReceipt(proof.paymentId,d),undefined,'Never recover a receipt from altered checkout terms')
 store.checkouts[id].merchantName=originalName
 console.log('PASS stablecoin Checkout: activation, permissions, accepted asset, exact precision, signed records, replay isolation, ledger identity, expiry and webhook retry.')
}}finally{await rm(root,{recursive:true,force:true})}

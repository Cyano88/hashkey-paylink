import assert from 'node:assert/strict'
import {quoteCheckoutPricing,validateCheckoutCurrency,requiresNgnPricing} from '../api/checkout-pricing.ts'
import {prepareDeveloperNairaCheckout} from '../api/developer-projects.ts'
import {createFoodDemoHandler} from '../api/food-demo.ts'
import {checkoutReceipt,checkoutBillingReceipt} from '../api/checkout-receipts.ts'
import {receiptEmail,receiptAmount,billingReceiptPdf} from '../api/billing-document.ts'
import {mkdir,writeFile} from 'node:fs/promises'
const policy={accountType:'business',profileCountry:'NG',checkoutMode:'human'}
assert(requiresNgnPricing(policy));assert(!requiresNgnPricing({...policy,accountType:'individual'}))
assert.throws(()=>validateCheckoutCurrency(policy,undefined,'2000'),/NGN/)
for(const amount of ['0','-1','1.001','1e3','NaN',2000])assert.throws(()=>validateCheckoutCurrency(policy,'NGN',amount))
assert.equal(validateCheckoutCurrency(policy,'NGN','02000.00'),'2000')
assert.equal(validateCheckoutCurrency({},undefined,'1.5'),undefined)
assert.throws(()=>validateCheckoutCurrency({...policy,checkoutMode:'agentic'},'NGN','2000'))
const pricing=await quoteCheckoutPricing('2000','USDT',async()=>1500,()=>0)
assert.equal(pricing.paymentAmount,'1.333334');assert.equal(pricing.rate,'1500')
assert.equal((await quoteCheckoutPricing('0.01','USDC',async()=>1500)).paymentAmount,'0.000007')
await assert.rejects(quoteCheckoutPricing('2000','USDe',async()=>1500),/USDC and USDT/)
await assert.rejects(quoteCheckoutPricing('2000','USDT',async()=>{throw Error('offline')}),/offline/)
await assert.rejects(quoteCheckoutPricing('2000','USDT',async()=>0),/quote/)
let store={orders:{}},clock=1_800_000_000_000,calls=0,status='pending',wrongPrice=false
const id='d'.repeat(32),checkoutId='chks_'+'a'.repeat(24)
const handler=createFoodDemoHandler({ngnPricing:async()=>true,rate:async()=>1500,selectionEnabled:async()=>true,ready:()=>true,choices:async()=>[{assets:['USDC','USDT']}],now:()=>clock,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},call:async(path,body)=>{
 if(body){calls++;assert.equal(body.amount,'2250');assert.equal(body.currency,'NGN');return{ok:true,checkoutId,checkoutUrl:'/pay/c/'+checkoutId,checkout:{selectionCheckout:true,currency:'NGN',amount:'2250'}}}
 return{ok:true,checkoutId,status,asset:'USDT',network:'xlayer',settlementMode:'usdc',pricing:{...pricing,amount:wrongPrice?'2000':'2250',paymentAmount:'1.5'},payment:{amount:'1.5',receiptId:'fixture-receipt-123'}}
}})
async function request(method,body={},query={}){let code=200,data;await handler({method,body,query},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return{code,data}}
const menu=await request('GET');assert.equal(menu.data.currency,'NGN');assert.equal(menu.data.menu.find(m=>m.id==='plantain').cents,225000)
const body={action:'prepare',requestId:id,items:[{id:'plantain',quantity:1}],quoteId:menu.data.quoteId,amount:'0.01'}
assert.equal((await request('POST',{...body,quoteId:'forged'})).code,400)
const made=await request('POST',body);assert.equal(made.code,200,JSON.stringify(made));assert.equal(calls,1)
clock+=16*60000;assert.equal((await request('POST',body)).code,200);assert.equal(calls,1,'Retry keeps original price and checkout')
assert.equal((await request('POST',{...body,requestId:'e'.repeat(32)})).code,400,'Expired menu cannot create a new order')
status='paid';wrongPrice=true;assert.equal((await request('GET',{}, {id})).data.order.status,'pending')
wrongPrice=false;const completed=(await request('GET',{}, {id})).data.order;assert.equal(completed.status,'paid');assert.equal(completed.orderPrice.amount,'2250');assert.equal(completed.amount,'1.5');assert.equal(completed.asset,'USDT')
const record={id:'chkx_'+'a'.repeat(24),checkoutMode:'human',network:'xlayer',amount:pricing.paymentAmount,asset:'USDT',recipient:'0x'+'2'.repeat(40),merchantName:'Lunchroom',title:'Lunchroom order ABC123',pricing,payment:{status:'paid',network:'xlayer',amount:pricing.paymentAmount,payer:'0x'+'1'.repeat(40),txHash:'0x'+'a'.repeat(64),confirmedAt:'2026-10-31T20:00:00Z',receiptId:'fixture-receipt-123'}}
const receipt=checkoutReceipt(record),billing=checkoutBillingReceipt(receipt)
assert.equal(receipt.pricing.amount,'2000');assert.match(receiptAmount(billing),/2,000.00/)
const email=receiptEmail(billing);assert(email.text.includes('Paid with: 1.33 USDT'));assert(email.text.includes('1 USDT = 1500 NGN'));assert(email.html.includes('2,000.00'))
const legacy=checkoutBillingReceipt(checkoutReceipt({...record,pricing:undefined}));assert.equal(receiptAmount(legacy),'1.33 USDT')
await mkdir('output/pdf',{recursive:true});await writeFile('output/pdf/ngn-checkout-receipt.pdf',await billingReceiptPdf({...billing,settlement:{amount:'2000',currency:'NGN'}}))
console.log('PASS NGN precision, fail-closed rates, server-stored menu selection, expired quote, retry, authoritative payment matching and immutable receipts.')

let providerInput
const localPolicy={...policy,partnerId:'fixture',merchantName:'Lunchroom',settlementMode:'ngn',nairaSettlement:{bankCode:'TEST',bankName:'Test Bank',accountNumber:'0123456789',accountName:'Test',refundAddress:'0x'+'1'.repeat(40)}}
const provider={availability:async()=>({exact:true,rate:1499,availableUsdc:'2'}),createOrder:async input=>{providerInput=input;return {amount_ngn:input.amountNgn,amount_usdc:'1.35',receive_address:'0x'+'2'.repeat(40)}}}
const payout=await prepareDeveloperNairaCheckout(localPolicy,'chk_fixture','1.333334',provider,{currency:'NGN',amount:'2000'})
assert.equal(providerInput.amountNgn,'2000');assert.equal(payout.amountNgn,'2000');assert.equal(payout.payableUsdc,'1.35')
await assert.rejects(prepareDeveloperNairaCheckout(localPolicy,'chk_fixture','1.333334',{...provider,createOrder:async()=>({amount_ngn:'1999.99'})},{currency:'NGN',amount:'2000'}),/did not match/)
console.log('PASS NGN payout keeps exact order price and rejects a mismatched provider payout.')

// Local settlement fulfillment binds the selected child's provider amount.
let localStore={orders:{}},localState='pending',badAmount=false,badSettlement=false
const localSession='chks_'+'f'.repeat(24),localOrderId='f'.repeat(32)
const localHandler=createFoodDemoHandler({ngnPricing:async()=>true,rate:async()=>1500,selectionEnabled:async()=>true,ready:()=>true,choices:async()=>[{assets:['USDC','USDT']}],now:()=>clock,read:async()=>structuredClone(localStore),mutate:async fn=>{localStore=fn(structuredClone(localStore));return structuredClone(localStore)},call:async(path,body)=>{
 if(body){assert.equal(body.paymentSelection,'stablecoins');assert.equal(body.asset,undefined);return {ok:true,checkoutId:localSession,checkoutUrl:'/pay/c/'+localSession,settlementMode:'ngn',checkout:{selectionCheckout:true,currency:'NGN',amount:'2250'}}}
 return {ok:true,checkoutId:localSession,status:localState,amount:'1.523804',asset:'USDC',network:'base',settlementMode:badSettlement?'usdc':'ngn',pricing:{...pricing,amount:'2250',paymentAsset:'USDC'},payment:{amount:badAmount?'1.5':'1.523804',receiptId:'fixture-local-receipt-123'}}
}})
async function localRequest(method,body={},query={}){let code=200,data;await localHandler({method,body,query},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this},sendStatus(n){code=n}});return {code,data}}
const localMenu=await localRequest('GET');assert.equal((await localRequest('POST',{action:'prepare',requestId:localOrderId,items:[{id:'plantain',quantity:1}],quoteId:localMenu.data.quoteId})).code,200)
localState='processing';assert.equal((await localRequest('GET',{}, {id:localOrderId})).data.order.status,'processing')
localState='paid';badAmount=true;assert.equal((await localRequest('GET',{}, {id:localOrderId})).data.order.status,'pending')
badAmount=false;badSettlement=true;assert.equal((await localRequest('GET',{}, {id:localOrderId})).data.order.status,'pending')
badSettlement=false;const localReceipt=(await localRequest('GET',{}, {id:localOrderId})).data.order
assert.equal(localReceipt.status,'paid');assert.equal(localReceipt.amount,'1.523804');assert.equal(localReceipt.asset,'USDC');assert.equal(localReceipt.network,'base');assert.equal(localReceipt.orderPrice.amount,'2250');assert.equal(localReceipt.receiptUrl,'/receipt/fixture-local-receipt-123')
console.log('PASS NGN selection merchant recovery: processing is not paid; exact child amount and local settlement required; original price and receipt retained.')

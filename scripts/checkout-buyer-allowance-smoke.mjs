import assert from 'node:assert/strict'
import {createCheckoutBuyerAllowance,checkoutBuyerLedgerKey,checkoutPaymentExecutionKey} from '../api/checkout-buyer-allowance.ts'
let now=Date.parse('2026-11-01T12:00:00Z'),cap=6992,ugx=2000,kyc=true,outage=false,records=[],ledgers=new Map(),queue=Promise.resolve(),mutations=0
const allowance=createCheckoutBuyerAllowance({now:()=>now,kyc:async()=>{if(!kyc)throw Object.assign(Error('Verify Basic'),{code:'KYC_BASIC_REQUIRED'})},limit:async(currency='NGN')=>{if(outage)throw Error('Provider down');return {maxUsdc:currency==='NGN'?cap:ugx}},read:async key=>structuredClone(ledgers.get(key)),orders:async ids=>records.filter(o=>ids.includes(o.intent_id)),mutate:async(key,fn)=>{const work=queue.then(async()=>{const next=await fn(ledgers.get(key));ledgers.set(key,next);mutations++;return next});queue=work.catch(()=>{});return work}})
const order=(id,amount,merchant='merchant1',currency='NGN')=>({source:'hosted-checkout',intent_id:id,paycrest_order_id:'provider_'+id,merchant_id:merchant,amount_usdc:amount,amount_ngn:'100',fiat_currency:currency,receive_address:'0x'+'1'.repeat(40),refund_address:'0x'+'2'.repeat(40),status:'initiated'})
const buyer='verified-basic-buyer',one=order('one','5000')
assert.equal(checkoutPaymentExecutionKey('wallet',one),checkoutPaymentExecutionKey('wallet',one))
assert.notEqual(checkoutPaymentExecutionKey('wallet',one),checkoutPaymentExecutionKey('wallet',{...one,paycrest_order_id:'new-provider-order'}))
assert.match(checkoutPaymentExecutionKey('wallet',one),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
await allowance(buyer,one,true);assert.equal(mutations,0,'Preview does not consume allowance')
await allowance(buyer,one,false);await allowance(buyer,one,false)
assert.equal(ledgers.get(checkoutBuyerLedgerKey(buyer)).charges.length,1,'Retry counts once')
await assert.rejects(allowance(buyer,order('two','2000.000001','merchant2'),false),e=>e.code==='CHECKOUT_DAILY_LIMIT')
await allowance('another-buyer',order('three','5000'),false)
await assert.rejects(allowance(buyer,{...one,amount_usdc:'5001'},false),e=>e.code==='CHECKOUT_LIMIT_BINDING')
await assert.rejects(allowance('small',order('too-big','6992.000001')),e=>e.code==='CHECKOUT_TRANSFER_LIMIT')
await assert.rejects(allowance('uganda',order('ug','2001','merchant','UGX')),e=>e.code==='CHECKOUT_TRANSFER_LIMIT')
await allowance('uganda',order('ug-ok','2000','merchant','UGX'),false)
kyc=false;await assert.rejects(allowance('unverified',one),e=>e.code==='KYC_BASIC_REQUIRED');kyc=true
outage=true;await assert.rejects(allowance(buyer,one),e=>e.code==='CHECKOUT_LIMIT_UNAVAILABLE');outage=false
await assert.rejects(allowance(buyer,{...one,source:'bank-withdraw'}),e=>e.code==='CHECKOUT_LIMIT_BINDING')
const parallel=await Promise.allSettled([allowance('racer',order('r1','4000'),false),allowance('racer',order('r2','4000','merchant2'),false)])
assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1,'Concurrent merchants share one locked buyer ledger')
records=[{...one,status:'failed'}];await assert.rejects(allowance(buyer,order('after-fail','3000'),false),e=>e.code==='CHECKOUT_DAILY_LIMIT')
records=[{...one,status:'refunded'}];await allowance(buyer,order('after-refund','3000'),false)
assert.equal(ledgers.get(checkoutBuyerLedgerKey(buyer)).charges[0].state,'refunded')
now=Date.parse('2026-11-01T23:00:00Z');await allowance(buyer,order('next-day','5000'),false)
cap=4000;await assert.rejects(allowance('newbuyer',order('lower-cap','5000')),e=>e.code==='CHECKOUT_TRANSFER_LIMIT')
console.log('PASS basic KYC, live capacity, NGN/UGX, per-buyer cross-merchant atomic quota, concurrency, retry binding, confirmed refunds, unavailable capacity and Lagos-day reset.')

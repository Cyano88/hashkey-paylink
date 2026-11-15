import assert from 'node:assert/strict'
import {createCheckoutBuyerAllowance,checkoutBuyerLedgerKey} from '../api/checkout-buyer-allowance.ts'
import {checkoutWalletAllowanceOrder} from '../api/checkout-wallet-allowance.ts'
import {qrWalletAllowanceOrder,qrFeeAllowanceOrder} from '../api/qr-purchase-allowance.ts'
let now=Date.parse('2026-11-15T12:00:00Z'),records=[],verified=true,capacity=6992,calls=0,store=new Map(),queue=Promise.resolve()
const allowance=createCheckoutBuyerAllowance({kyc:async()=>{if(!verified)throw Object.assign(Error('Basic required'),{code:'KYC_BASIC_REQUIRED'})},limit:async()=>{calls++;return {maxUsdc:capacity}},read:async k=>structuredClone(store.get(k)),mutate:async(k,f)=>{const work=queue.then(()=>{const result=f(store.get(k));store.set(k,result);return result});queue=work.catch(()=>{});return work},orders:async ids=>records.filter(o=>ids.includes(o.intent_id)),now:()=>now})
const qr=(id,amount,network='base',asset='USDC',usdAmount)=>qrWalletAllowanceOrder({id,merchantId:'restaurant',network,asset,amount,usdAmount,recipient:'merchant-wallet',payer:'buyer-wallet'})
const online=checkoutWalletAllowanceOrder({id:'chk_online123',network:'base',asset:'USDC',amount:'5000',recipient:'online-store',payer:'buyer-wallet'})
await allowance('buyer',online,false)
await allowance('buyer',qr('meal','2000','solana'),false)
await allowance('buyer',qr('meal','2000','solana'),false)
await assert.rejects(allowance('buyer',qr('another-meal','0.000001'),false),e=>e.code==='CHECKOUT_DAILY_LIMIT')
await assert.rejects(allowance('buyer',qr('meal','1999','solana'),false),e=>e.code==='CHECKOUT_LIMIT_BINDING')
const bank={source:'ngpos',intent_id:'qr-bank',paycrest_order_id:'provider-1',merchant_id:'restaurant-bank',receive_address:'provider',refund_address:'buyer-wallet',amount_usdc:'4000',amount_ngn:'5600000',fiat_currency:'NGN'}
const raced=await Promise.allSettled([allowance('racer',bank,false),allowance('racer',qr('wallet-race','4000'),false)])
assert.equal(raced.filter(r=>r.status==='fulfilled').length,1)
await allowance('stock',qr('stock-meal','0.5','xlayer','NVDAx','100'),false)
assert.equal(store.get(checkoutBuyerLedgerKey('stock')).charges[0].units,100000000)
await assert.rejects(allowance('stock',qr('stock-meal','0.6','xlayer','NVDAx','100'),false),e=>e.code==='CHECKOUT_LIMIT_BINDING')
for(let i=0;i<120;i++)await allowance('preview',qr('preview-'+i,'1'),true)
assert.equal(store.has(checkoutBuyerLedgerKey('preview')),false,'Unsigned quote previews never reserve spending')
capacity=1000;await assert.rejects(allowance('bank',bank,true),e=>e.code==='CHECKOUT_TRANSFER_LIMIT')
const before=calls;await allowance('wallet-independent',qr('wallet','7000'),false);assert.equal(calls,before)
verified=false;await assert.rejects(allowance('unverified',qr('kyc','1'),false),e=>e.code==='KYC_PURCHASE_REQUIRED');verified=true
await assert.rejects(allowance('personal',{...bank,source:'bank-withdraw'},false),e=>e.code==='CHECKOUT_LIMIT_BINDING')
await allowance('refund',bank,false);records=[{...bank,status:'failed'}]
await assert.rejects(allowance('refund',qr('uncertain','4000'),false),e=>e.code==='CHECKOUT_DAILY_LIMIT')
records=[{...bank,status:'refunded'}];await allowance('refund',qr('after-refund','7000'),false)
now=Date.parse('2026-11-15T23:00:00Z');await allowance('buyer',qr('next-day','7000'),false)
const quote={id:'quote-1',checkoutId:'pos_restaurant',purpose:'payment',mode:'net',exemption:'none',asset:'USDC',chain:'solana',amountUnits:'1500000',recipient:'AbCd',walletAddress:'XyZ'}
assert.equal(qrFeeAllowanceOrder(quote).amount_usdc,'1.5')
assert.notEqual(qrFeeAllowanceOrder(quote).intent_id,qrFeeAllowanceOrder({...quote,id:'quote-2'}).intent_id)
assert.throws(()=>qrFeeAllowanceOrder({...quote,purpose:'wallet-send'}))
console.log('PASS shared online/QR cap, cross-rail concurrency, bank capacity, stock USD valuation, immutable amount binding, Basic KYC, 120 harmless previews, retries, refunds, separate personal transfers and Lagos reset.')

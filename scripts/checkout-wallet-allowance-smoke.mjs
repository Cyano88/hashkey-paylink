import assert from 'node:assert/strict'
import {checkoutWalletAllowanceOrder} from '../api/checkout-wallet-allowance.ts'
import {createCheckoutBuyerAllowance,checkoutBuyerLedgerKey} from '../api/checkout-buyer-allowance.ts'
let store=new Map(),queue=Promise.resolve(),verified=true,capacityCalls=0,capacityDown=false;
const allowance=createCheckoutBuyerAllowance({kyc:async()=>{if(!verified)throw Object.assign(Error('Verify Basic'),{code:'KYC_BASIC_REQUIRED'})},limit:async()=>{capacityCalls++;if(capacityDown)throw Error('Bank provider unavailable');return {maxUsdc:6992}},read:async k=>structuredClone(store.get(k)),mutate:async(k,f)=>{const work=queue.then(()=>{const next=f(store.get(k));store.set(k,next);return next});queue=work.catch(()=>{});return work},orders:async()=>[],now:()=>Date.parse('2026-11-08T12:00:00Z')});
const wallet=(network,amount,id='chk_12345678',asset='USDC')=>checkoutWalletAllowanceOrder({network,amount,id,asset,recipient:'merchant',payer:'payer'});
for(const network of ['base','arc','arbitrum','ethereum','polygon','solana','bsc','xlayer']){
 const a=wallet(network,'1.000000000000000001');assert.equal(a.amount_usdc,'1.000001');
 await allowance('owner-'+network,a,false);await allowance('owner-'+network,a,false);assert.equal(store.get(checkoutBuyerLedgerKey('owner-'+network)).charges.length,1)
}
verified=false;await assert.rejects(allowance('new',wallet('base','1')),e=>e.code==='KYC_BASIC_REQUIRED');verified=true;
const bank={source:'hosted-checkout',intent_id:'bank-order',paycrest_order_id:'provider-1',merchant_id:'merchant',receive_address:'bank-provider',refund_address:'payer',amount_usdc:'4000',amount_ngn:'5475000',fiat_currency:'NGN'};
const mixed=await Promise.allSettled([allowance('same-pocket-identity',bank,false),allowance('same-pocket-identity',wallet('bsc','4000','chkb_123456789012345678901234','USDT'),false)]);assert.equal(mixed.filter(r=>r.status==='fulfilled').length,1);
await assert.rejects(allowance('same-pocket-identity',wallet('solana','3000.000001','chk_other123'),false),e=>e.code==='CHECKOUT_DAILY_LIMIT');
assert.throws(()=>wallet('unknown','1'));assert.throws(()=>wallet('base','0'));assert.throws(()=>wallet('base','1','not-a-checkout'));
capacityDown=true;const before=capacityCalls;
await allowance('wallet-only',wallet('base','7000','chk_full7000'),false);
await allowance('wallet-only',wallet('base','7000','chk_full7000'),false);
assert.equal(capacityCalls,before,'Wallet payments must not query bank liquidity');
await assert.rejects(allowance('wallet-only',wallet('bsc','0.000001','chkb_aaaaaaaaaaaaaaaaaaaaaaaa','USDT'),false),e=>e.code==='CHECKOUT_DAILY_LIMIT');
await assert.rejects(allowance('bank-outage',bank,true),e=>e.code==='CHECKOUT_LIMIT_UNAVAILABLE');
const executionCalls=capacityCalls;await allowance('quoted-bank-payment',bank,false);assert.equal(capacityCalls,executionCalls,'Execution must not repeat the capacity probe');
console.log('PASS all eight networks, Basic verification, shared cash/stablecoin/USDT atomic ledger, retry counting, sub-micro rounding and invalid bindings.');

import assert from 'node:assert/strict'
import {checkoutReceipt,checkoutBillingReceipt,readCheckoutReceipt,checkoutNetworkNames} from '../api/checkout-receipts.ts'
import {createCheckoutReceiptContactHandler} from '../api/checkout-receipt-contact.ts'
import {reconcileReceiptContacts} from '../api/checkout-receipt-emails.ts'
import {receiptEmail} from '../api/billing-document.ts'
const time=Date.parse('2026-10-30T12:00:00Z'),id='chk_1234567890123456'
const base={id,partnerId:'project',merchantName:'Lunchroom',title:'Order 123',amount:'1.5',asset:'USDC',network:'base',recipient:'0xrecipient',createdAt:new Date(time-1000).toISOString(),expiresAt:new Date(time+60000).toISOString(),checkoutMode:'human',payment:{status:'paid',txHash:'0xABC',payer:'0xPayer',amount:'1.5',confirmedAt:new Date(time).toISOString()}}
const settings={enabled:true,enabledAt:new Date(time-2000).toISOString(),supportEmail:'support@example.test',timeZone:'UTC'}
for(const network of Object.keys(checkoutNetworkNames)){
 const r=checkoutReceipt({...base,network,asset:network==='xlayer'?'USDT':'USDC'}),b=checkoutBillingReceipt(r,'project',settings)
 assert.equal(r.chain,network);assert.equal(r.status,'confirmed');assert.equal(b.network,checkoutNetworkNames[network]);assert.equal(b.paymentMethod,'wallet');assert(receiptEmail(b).text.includes('Network: '+b.network))
}
assert.equal(checkoutReceipt({...base,payment:undefined}),undefined)
assert.equal(checkoutReceipt({...base,checkoutMode:'agentic'}),undefined)
assert.equal(checkoutReceipt({...base,payment:{...base.payment,network:'polygon'},paymentOptions:[{network:'polygon',recipient:'chosen'}]}).destination,'chosen')
for(const mode of ['ngn','ugx'])for(const status of ['processing','failed','refunded','refunding','expired','settled','validated']){
 const r=checkoutReceipt({...base,settlement:{mode,amountNgn:'2000'},payout:{status}})
 assert.equal(r.status==='confirmed',['settled','validated'].includes(status));assert.equal(r.paymentMethod,'wallet');assert.equal(r.bankSettlementStatus,status)
 if(r.status==='confirmed')assert.equal(checkoutBillingReceipt(r).settlement.currency,mode.toUpperCase());else assert.throws(()=>checkoutBillingReceipt(r))
}
const readers={checkout:async()=>base,stockReceipt:async()=>undefined,bscReceipt:async()=>null,registered:async()=>({source:'hosted-checkout',merchantId:id,chain:'base',txHash:'0xabc'})}
assert.equal((await readCheckoutReceipt('v1.signed.alias',readers)).receiptId,id)
assert.equal(await readCheckoutReceipt('v1.signed.alias',{...readers,registered:async()=>({source:'hosted-checkout',merchantId:id,chain:'polygon',txHash:'0xabc'})}),undefined)
assert.equal(await readCheckoutReceipt('v1.signed.alias',{...readers,checkout:async()=>({...base,network:'solana',payment:{...base.payment,txHash:'AbC'}}),registered:async()=>({source:'hosted-checkout',merchantId:id,chain:'solana',txHash:'abc'})}),undefined)
let store={contacts:{}},owned=true,record={...base,payment:undefined},email='verified@example.test'
const handler=createCheckoutReceiptContactHandler({identity:async()=>({userId:'owner',email}),checkout:async()=>record,settings:async()=>settings,owns:async()=>owned,now:()=>time,mutate:async fn=>{store=fn(store);return store}})
async function post(patch={}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',body:{checkoutId:id,network:'base',payer:'0xPayer',email:'attacker@example.test',...patch}},res);return res}
assert.equal((await post()).statusCode,200);assert.equal(Object.values(store.contacts)[0].email,email)
email='changed@example.test';await post();assert.equal(Object.values(store.contacts)[0].email,'verified@example.test')
assert.equal((await post({network:'bsc'})).statusCode,403);owned=false;assert.equal((await post()).statusCode,403);owned=true
record={...base,payment:undefined,expiresAt:new Date(time-1).toISOString()};assert.equal((await post()).body.enabled,false)
record={...base,payment:undefined};email=undefined;assert.equal((await post()).body.enabled,false);email='verified@example.test'
record=base;assert.equal((await post()).body.enabled,false);assert.equal(Object.keys(store.contacts).length,1)
const queued=[],contact=Object.values(store.contacts)[0]
const deps={contacts:async()=>({contact}),checkout:async()=>base,settings:async()=>settings,queue:async(...args)=>queued.push(args)}
await reconcileReceiptContacts(deps);assert.equal(queued.length,1);assert.equal(queued[0][0],'verified@example.test');assert.equal(queued[0][1].network,'Base')
for(const patch of [{payment:{...base.payment,payer:'other'}},{payment:{...base.payment,network:'polygon'}},{settlement:{mode:'ngn',amountNgn:'2000'},payout:{status:'processing'}},{createdAt:new Date(time-3000).toISOString()}])await reconcileReceiptContacts({...deps,checkout:async()=>({...base,...patch})})
assert.equal(queued.length,1)
for(const [method,label]of [['wallet','Wallet payment'],['bank_transfer','Bank transfer'],['card','Card payment']])assert(receiptEmail({...checkoutBillingReceipt(checkoutReceipt(base)),paymentMethod:method}).text.includes(label))
console.log('PASS all 8 networks, actual destination, local delivery gates, signed aliases, Solana case binding, verified recipient only, wallet ownership, immutable contact and email reconciliation. No real email sent.')

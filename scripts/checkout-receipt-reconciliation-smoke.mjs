import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync} from 'node:fs'
mkdirSync('.codex-temp',{recursive:true})
const mocks={
 './checkout-receipt-contact.js':`export const readReceiptContacts=async()=>({})`,
 './checkout-receipts.js':`export const readReceiptCheckout=async()=>null;export const checkoutReceipt=()=>undefined;export const checkoutBillingReceipt=()=>undefined`,
 './render-durable-store.js':`export const hasRenderDurableStore=()=>true;export const readDurableJson=async k=>structuredClone(k.includes('pocket-xpay')?globalThis.fixture.payments:globalThis.fixture.outbox);export const mutateDurableJson=async(k,fn)=>{globalThis.fixture.outbox=fn(structuredClone(globalThis.fixture.outbox));return structuredClone(globalThis.fixture.outbox)}`,
 './developer-receipt-settings.js':`export const readDeveloperReceiptSettings=async id=>id==='enabled'?{enabled:true,supportEmail:'help@example.test',timeZone:'Africa/Lagos',enabledAt:'2026-10-29T10:00:00Z'}:undefined`,
 './hosted-stock-checkouts.js':`export const readStockCheckout=async id=>({partnerId:id.endsWith('2')?'disabled':'enabled'});export const readStockCheckoutReceipt=async id=>{if(id==='bad')throw Error('Unavailable receipt');return {receiptId:id,payer:id==='wrong-owner'?'other':'payer',recipient:'Lunchroom',memo:'Lunchroom order fixture',amount:'1.50',asset:'USDT',createdAt:Date.parse('2026-10-29T11:00:00Z')}}`,
 './billing-document.js':`export const billingReceiptPdf=async r=>{globalThis.fixture.receipts.push(r);return Buffer.from('fixture PDF')};export const receiptEmail=()=>({subject:'Fixture receipt',text:'Fixture',html:'Fixture'})`,
 './email-provider.js':`export const sendTransactionalEmail=async input=>{globalThis.fixture.sent.push(input);return 'provider-fixture'}`,
}
await build({entryPoints:['api/checkout-receipt-emails.ts'],outfile:'.codex-temp/receipt-reconciliation-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
process.env.CHECKOUT_RECEIPT_EMAIL_ENABLED='true';process.env.RECEIPT_FROM_EMAIL='receipts@example.test'
const payment=(id,extra={})=>({id,status:'paid',merchantId:'chkx_'+'1'.repeat(24),payer:'payer',createdAt:Date.parse('2026-10-29T11:00:00Z'),receiptEmail:'verified@example.test',...extra})
globalThis.fixture={payments:{payments:Object.fromEntries([
 payment('bad'),payment('eligible'),payment('old',{createdAt:Date.parse('2026-10-28T11:00:00Z')}),payment('disabled',{merchantId:'chkx_'+'2'.repeat(24)}),payment('unpaid',{status:'submitted'}),payment('anonymous',{receiptEmail:undefined}),payment('wrong-owner'),payment('internal',{merchantId:'internal-wallet'})
].map(p=>[p.id,p]))},outbox:{jobs:{}},receipts:[],sent:[]}
const {reconcileCheckoutReceiptEmails}=await import('../.codex-temp/receipt-reconciliation-test.mjs')
await reconcileCheckoutReceiptEmails();await reconcileCheckoutReceiptEmails()
assert.equal(fixture.sent.length,1);assert.equal(fixture.sent[0].to,'verified@example.test');assert.equal(fixture.sent[0].replyTo,'help@example.test')
assert.equal(fixture.receipts[0].id,'eligible');assert.equal(fixture.receipts[0].timeZone,'Africa/Lagos');assert.equal(Object.values(fixture.outbox.jobs)[0].state,'sent')
console.log('PASS automatic reconciliation: paid + verified + enabled only, no backfill, canonical owner match, failed preparation isolated, one send across repeated scans. No real email sent.')

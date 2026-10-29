import assert from 'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs'
import {queueCheckoutReceiptEmail,drainCheckoutReceiptEmails} from '../api/checkout-receipt-emails.ts'
import {billingReceiptPdf,receiptEmail} from '../api/billing-document.ts'
const receipt={id:'fixture-receipt',merchant:'Lunchroom',description:'Golden plantain',amount:'1.5',asset:'USDT',network:'X Layer',paidAt:'2026-10-29T10:37:00.000Z',paymentMethod:'wallet',receiptUrl:'https://app.hashpaylink.com/receipt/fixture-receipt'}
let state={jobs:{}},now=1000,sends=0,fail=true
const d={enabled:()=>true,from:()=> 'receipts@example.test',now:()=>now,read:async()=>structuredClone(state),mutate:async fn=>{state=fn(structuredClone(state));return structuredClone(state)},send:async input=>{sends++;assert.equal(input.to,'payer@example.test');assert(input.idempotencyKey.startsWith('checkout-receipt/'));assert.equal(input.attachments[0].content_type,'application/pdf');if(fail)throw Error('uncertain transport');return 'email-provider-id'}}
await Promise.all([queueCheckoutReceiptEmail('payer@example.test',receipt,d),queueCheckoutReceiptEmail('payer@example.test',receipt,d)]);assert.equal(Object.keys(state.jobs).length,1)
const payload=JSON.stringify(Object.values(state.jobs)[0].input)
await Promise.all([drainCheckoutReceiptEmails(d),drainCheckoutReceiptEmails(d)]);assert.equal(sends,1)
now+=120000;fail=false;await drainCheckoutReceiptEmails(d);assert.equal(sends,2);assert.equal(Object.values(state.jobs)[0].state,'sent');assert.equal(JSON.stringify(Object.values(state.jobs)[0].input),payload)
await drainCheckoutReceiptEmails(d);assert.equal(sends,2)
const j=Object.values(state.jobs)[0];j.state='pending';j.firstAttemptAt=1;j.nextAt=0;now=21*60*60_000;await drainCheckoutReceiptEmails(d);assert.equal(j.state,'pending');assert.equal(Object.values(state.jobs)[0].state,'review');assert.equal(sends,2)
assert(!receiptEmail({...receipt,merchant:'<script>alert(1)</script>'}).html.includes('<script>'))
await assert.rejects(queueCheckoutReceiptEmail('attacker\n@example.test',receipt,d),/Verified purchaser/)
mkdirSync('output/playwright',{recursive:true});writeFileSync('output/playwright/checkout-receipt-email.html',receiptEmail(receipt).html);writeFileSync('output/playwright/checkout-receipt-email.pdf',await billingReceiptPdf(receipt))
console.log('PASS receipt email: PDF, escaped template, one durable job, concurrent lease, immutable retry payload, provider idempotency window and no repeat after sent. Fixture artifacts created; no email sent.')

await queueCheckoutReceiptEmail('payer@example.test',{...receipt,id:'disabled-project-receipt',projectId:'disabled-project'},d);await drainCheckoutReceiptEmails({...d,canSend:async()=>false});assert.equal(Object.values(state.jobs).find(j=>j.projectId==='disabled-project').state,'canceled');assert.equal(sends,2);console.log('PASS disabling project cancels unsent receipts.');

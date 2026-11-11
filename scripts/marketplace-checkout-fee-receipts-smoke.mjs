import assert from 'node:assert/strict'
import {createBoundMarketplaceHostedCheckout,markHostedCheckoutPaid} from '../api/hosted-checkouts.ts'
import {checkoutReceipt,checkoutBillingReceipt} from '../api/checkout-receipts.ts'
import {receiptEmail,billingReceiptPdf} from '../api/billing-document.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {validatePayerCheckoutFees} from '../src/lib/payerCheckoutFees.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import {checkoutActivityRows} from '../api/pocket/checkout-activity.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {pocketActivityAmount} from '../src/pocket/lib/pocketActivityPresentation.ts'
import {isPocketActivityRow} from '../src/pocket/lib/pocketSchemas.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
let stored,queue=Promise.resolve()
const now=Date.parse('2026-11-09T16:00:00Z')
const deps={hasStore:()=>true,signingSecret:()=> 'fixture-signing-secret-at-least-32-characters',createId:()=> 'chk_marketplace12345678',now:()=>new Date(now),read:async()=>structuredClone(stored),mutate:async(_key,fn)=>{const job=queue.then(()=>{const next=fn(structuredClone(stored));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job},notify:async()=>({status:'sent'}),executions:{update:async()=>({id:'execution_a',state:'completed'}),create:async()=>({intent:{id:'execution_a',resourceId:'bound_checkout'}})}}
const checkout=await createBoundMarketplaceHostedCheckout({projectId:'project_a',paymentId:'payment_a',amount:'100',holdingAddress:'0x'+'22'.repeat(20),holdingId:'holding_a',holdingRevision:'revision_a',merchantName:'Marketplace Example',title:'Order A',returnUrl:'https://market.example/orders/a',allowedOrigins:['https://market.example']},async()=>{},deps)
const input={id:checkout.checkoutId,txHash:'0x'+'aa'.repeat(32),payer:'0x'+'33'.repeat(20),amount:'100',confirmedAt:new Date(now+1000).toISOString(),network:'base'}
const fees={quoteId:'quote_a',treasuryAddress:EVM_PLATFORM_TREASURY,platformFeeUnits:'250000',networkFeeUnits:'10000',treasuryUnits:'260000',totalUnits:'100260000'}
await assert.rejects(()=>markHostedCheckoutPaid(input,deps),/Verified payer fees/)
assert.equal(stored.checkouts[input.id].payment,undefined)
await assert.rejects(()=>markHostedCheckoutPaid({...input,payerFees:{...fees,totalUnits:'100000000'}},deps),/totals/)
const paid=await markHostedCheckoutPaid({...input,payerFees:fees},deps)
assert.deepEqual(paid.payment.payerFees,fees)
assert.equal(checkoutReceipt({...paid,payment:{...paid.payment,payerFees:undefined}}),undefined)
assert.equal(paid.payment.amount,'100') // allocation principal never becomes total payer debit
assert.deepEqual((await markHostedCheckoutPaid({...input,payerFees:fees},deps)).payment,paid.payment)
await assert.rejects(()=>markHostedCheckoutPaid({...input,payerFees:{...fees,quoteId:'quote_b'}},deps),/cannot change/)
const receipt=checkoutReceipt(structuredClone(stored.checkouts[input.id])),view=paymentReceiptView(receipt),billing=checkoutBillingReceipt(receipt)
const payerRow=checkoutActivityRows(paid,[input.payer])[0]
assert.ok(isPocketActivityRow(payerRow))
assert.deepEqual(payerRow.payerFees,fees)
assert.equal(pocketActivityAmount(payerRow),'100.26 USDC')
assert.equal(paymentReceiptView(pocketActivityReceipt(payerRow)).amount,'100.26 USDC')
assert.equal(isPocketActivityRow({...payerRow,payerFees:{...fees,totalUnits:'100'}}),false)
assert.equal(isPocketActivityRow({...payerRow,direction:'in'}),false)
const merchantRow=checkoutActivityRows(paid,[paid.recipient])[0]
assert.equal(merchantRow.payerFees,undefined)
assert.equal(pocketActivityAmount(merchantRow),'100.00 USDC')
const rawFee={...payerRow,eventId:'raw-fee',source:'wallet-withdrawal',settlementType:'wallet_transfer',payerFees:undefined,recipient:EVM_PLATFORM_TREASURY,amount:'0.26'}
const unrelated={...rawFee,eventId:'unrelated',amount:'0.27'}
const merged=mergePocketActivityRows([rawFee,unrelated],[payerRow])
assert.equal(merged.length,2);assert.ok(merged.some(r=>r.eventId==='unrelated'));assert.ok(!merged.some(r=>r.eventId==='raw-fee'))
assert.equal(view.amount,'100.26 USDC')
for(const [label,value] of [['Order amount','100.00 USDC'],['Processing fee','0.25 USDC'],['Collection network fee','0.01 USDC'],['Total paid','100.26 USDC']])assert.equal(view.rows.find(r=>r.label===label).value,value)
const email=receiptEmail(billing)
for(const value of ['100.26 USDC','0.25 USDC','0.01 USDC','Collection network fee']){assert.ok(email.text.includes(value));assert.ok(email.html.includes(value))}
const pdf=await billingReceiptPdf(billing);assert.ok(pdf.length>1000);assert.equal(pdf.subarray(0,4).toString(),'%PDF')
assert.throws(()=>validatePayerCheckoutFees('100',{...fees,networkFeeUnits:'-1'}))
assert.throws(()=>validatePayerCheckoutFees('100',{...fees,treasuryUnits:'250000'}))
console.log('PASS verified checkout fee persistence, missing/tampered evidence rejection, immutable retries, preserved principal, exact receipt/email breakdown and PDF generation. Fixtures only; no email sent or funds moved.')

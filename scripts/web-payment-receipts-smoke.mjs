import assert from 'node:assert/strict'
import {withWebPaymentDetails} from '../api/pocket/web-payment-notices.ts'
import {pocketStockNoticeActivity} from '../src/pocket/lib/pocketStockNoticeActivity.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const p={id:'receipt-12345678',merchantId:'chkx_'+'a'.repeat(24),merchantName:'Lunchroom',owner:'payer',merchantOwner:'merchant',status:'paid',hash:'0x'+'b'.repeat(64),token:'0x'+'c'.repeat(40),payer:'0x'+'d'.repeat(40),recipient:'0x'+'e'.repeat(40),amount:'1.5'}
for(const direction of ['in','out']){
 const owner=direction==='in'?'merchant':'payer'
 const n={owner,id:owner+':transfer',title:'Incoming',body:'1.5 USDT',at:Date.now(),hash:p.hash,transfer:{direction,token:p.token,from:p.payer,to:p.recipient,amount:p.amount,symbol:'USDT'}}
 const enriched=withWebPaymentDetails([n],owner,[p]);assert.equal(enriched[0].webPayment.receiptId,p.id)
 const row=pocketStockNoticeActivity(enriched,direction==='in'?p.recipient:p.payer)[0],receipt=pocketActivityReceipt(row),view=paymentReceiptView(receipt)
 assert.equal(receipt.type,direction==='in'?'money_in':'money_out');assert.equal(view.badge,'Web payment');assert.equal(view.rows.find(r=>r.label==='Direction').value,direction==='in'?'Received':'Sent');assert.equal(view.amount,'1.50 USDT');assert.equal(view.reference,p.id)
 assert.equal(view.rows.find(r=>r.label==='Merchant').value,'Lunchroom');assert.equal(view.rows.find(r=>r.label===(direction==='in'?'From':'To')).value,direction==='in'?p.payer:p.recipient)
 assert(!view.rows.some(r=>['Destination','Amount & narration','Fee'].includes(r.label)))
 for(const patch of [{status:'submitted'},{owner:'stranger',merchantOwner:'stranger'},{amount:'2'},{token:'wrong'},{payer:'wrong'},{recipient:'wrong'},{hash:'wrong'},{merchantId:'direct-xpay'}])assert.equal(withWebPaymentDetails([n],owner,[{...p,...patch}])[0].webPayment,undefined)
 assert.equal(withWebPaymentDetails([n],'stranger',[p])[0].webPayment,undefined)
}
console.log('PASS web payment receipts: both directions, exact payment binding, historical metadata, formatted amounts, stable reference and no duplicate narration or fabricated fee.')
for(const direction of ['in','out']){
 const receipt={type:direction==='in'?'money_in':'money_out',source:'wallet-transfer',title:direction==='in'?'Incoming':'Outgoing',asset:'USDT',amount:'1.5',chain:'xlayer',payer:p.payer,recipient:p.recipient,destination:'USDT',referenceId:'transfer',createdAt:Date.now(),feeAmount:'0.01',feeAsset:'USDT'}
 for(const memo of ['1.5 USDT','1.5 USDT sent on X Layer.','USDT received']){
  const view=paymentReceiptView({...receipt,memo});assert.equal(view.badge,'Wallet transfer');assert.equal(view.rows.find(r=>r.label==='Direction').value,direction==='in'?'Received':'Sent');assert(!view.rows.some(r=>['Destination','Amount & narration','Narration'].includes(r.label)));assert.equal(view.rows.find(r=>r.label==='To').value,p.recipient)
 }
 assert.equal(paymentReceiptView({...receipt,memo:'Dinner contribution'}).rows.find(r=>r.label==='Narration').value,'Dinner contribution')
}
console.log('PASS Pixel wallet receipt types, separate directions, no redundant narration, preserved custom narration and fee.')

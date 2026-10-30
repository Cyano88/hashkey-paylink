import assert from 'node:assert/strict'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const receipt={type:'money_out',source:'bank-withdraw',title:'Bank transfer',asset:'USDC',amount:'0.754111',amountNgn:'1000',fiatCurrency:'NGN',chain:'base',payer:'payer',recipient:'recipient',destination:'OPay ****9696',referenceId:'existing-reference',createdAt:Date.now(),brandKind:'pocket',bankSettlementStatus:'settled'}
for(const memo of ['', 'Bank transfer', 'Direct bank payout']){
 const view=paymentReceiptView({...receipt,memo})
 assert.equal(view.badge,'Bank transfer')
 assert.equal(view.rows.find(row=>row.label==='Type').value,'Bank transfer')
 assert.equal(view.rows.find(row=>row.label==='Receiver account').value,'OPay ****9696')
 assert.equal(view.rows.find(row=>row.label==='Bank delivery').value,'Delivered')
 assert(!view.rows.some(row=>['Amount & narration','Narration'].includes(row.label)))
 assert(!JSON.stringify(view).includes('\u00c2'))
 assert.equal(view.reference,'existing-reference')
}
assert.equal(paymentReceiptView({...receipt,memo:'Lunch contribution'}).rows.find(row=>row.label==='Narration').value,'Lunch contribution')
// Fiat merchant settlement must not change how the purchaser actually paid.
const web=paymentReceiptView({...receipt,source:'hosted_checkout',settlementType:'hosted_checkout',title:'Web payment',asset:'USDT',amount:'1.5'})
assert.equal(web.badge,'Web payment')
assert.equal(web.rows.find(row=>row.label==='Type').value,'Wallet payment')
assert.equal(web.amount,'1.50 USDT')
console.log('PASS bank receipt labels, clean narration, stable reference, and wallet-funded web payment with fiat settlement.')

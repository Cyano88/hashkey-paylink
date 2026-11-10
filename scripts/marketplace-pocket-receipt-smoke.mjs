import assert from 'node:assert/strict'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const row={eventId:'marketplace-refund-a',txHash:'0x'+'a'.repeat(64),chain:'base',payer:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),destination:'0x'+'2'.repeat(40),memo:'Marketplace refund',source:'marketplace-refund',contextLabel:'Example Store - Refund',merchantName:'Example Store',direction:'in',settlementType:'wallet_transfer',paycrestStatus:'confirmed',amount:'0.03',assetSymbol:'USDC',feeAmount:'0',ts:Date.now()}
const receipt=pocketActivityReceipt(row),view=paymentReceiptView(receipt)
assert.equal(view.badge,'Refund')
assert.deepEqual(view.rows.find(r=>r.label==='Marketplace'),{label:'Marketplace',value:'Example Store'})
assert.equal(view.rows.filter(r=>r.value===row.recipient).length,1)
assert.ok(!view.rows.some(r=>['Destination','Narration'].includes(r.label)))
assert.equal(view.rows.find(r=>r.label==='Fee deducted').value,'0.00 USDC')
assert.equal(pocketActivityReceipt({...row,merchantName:undefined}).marketplaceName,'Example Store','existing server context remains supported')
assert.equal(pocketActivityReceipt({...row,merchantName:undefined,contextLabel:'Marketplace refund'}).marketplaceName,undefined)
const payout=paymentReceiptView(pocketActivityReceipt({...row,source:'marketplace-payout',amount:'0.016403',feeAmount:'0.003597',contextLabel:'Example Store - Payout'}))
assert.equal(payout.badge,'Payout');assert.ok(payout.rows.some(r=>r.label==='Withdrawal fee'))
const generic={...receipt,source:'custom-transfer',marketplaceName:undefined}
assert.ok(!paymentReceiptView(generic).rows.some(r=>r.label==='Destination'),'duplicate generic destination omitted')
assert.ok(paymentReceiptView({...generic,destination:'Other destination'}).rows.some(r=>r.label==='Destination'),'distinct destination retained')
const bank=paymentReceiptView({...generic,source:'bank-withdraw',destination:'Bank account ending 1234'})
assert.ok(bank.rows.some(r=>r.label==='Receiver account'),'distinct bank information retained')
console.log('PASS Marketplace receipt names, refund/payout types, recipient deduplication, fees, legacy context and distinct bank destination.')

assert.equal(payout.amount,'0.016403 USDC');assert.equal(payout.rows.find(r=>r.label==='Withdrawal fee').value,'0.003597 USDC')
assert.equal(paymentReceiptView({...receipt,amount:'1.50000'}).amount,'1.50 USDC')

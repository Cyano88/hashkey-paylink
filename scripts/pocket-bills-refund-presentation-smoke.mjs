import assert from 'node:assert/strict'
import {paymentReceiptOutcome} from '../src/lib/paymentReceiptPdf.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
for (const [status,label] of [['refund available','Refund available'],['refunding','Refunding'],['refunded','Refunded']]) assert.equal(paymentReceiptOutcome({source:'bills',status}).label,label)
const bill={eventId:'pocket-bill:fixture',txHash:'0x'+'1'.repeat(64),refundTxHash:'0x'+'2'.repeat(64),chain:'base',source:'bills',direction:'out',amount:'0.36812',amountNgn:'500',ts:1,paycrestStatus:'refunded',billCategory:'electricity'}
const refund={eventId:'refund-deposit',txHash:bill.refundTxHash,chain:'base',source:'wallet-deposit',direction:'in',amount:'0.36812',ts:2}
const unrelated={...refund,eventId:'other',txHash:'0x'+'3'.repeat(64)}
const wrongAmount={...refund,eventId:'other-amount',amount:'1'}
const rows=mergePocketActivityRows([refund,unrelated,wrongAmount],[bill])
assert.equal(rows.length,3)
assert(!rows.some(row=>row.eventId==='refund-deposit'))
assert(rows.some(row=>row.eventId==='other'))
assert(rows.some(row=>row.eventId==='other-amount'))
const receipt=pocketActivityReceipt(bill,{allowPending:true})
assert.equal(receipt.refundTxHash,bill.refundTxHash)
assert.equal(receipt.txHash,bill.txHash)
assert.equal(receipt.amount,'0.36812')
console.log('PASS: bill refund labels and original/refund proofs stay on one record; unrelated deposits remain.')

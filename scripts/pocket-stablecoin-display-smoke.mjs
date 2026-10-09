import assert from 'node:assert/strict'
import {formatPocketDisplayAmount,formatPocketPaymentAmount} from '../src/pocket/lib/pocketMoney.ts'
import {pocketActivityAmount} from '../src/pocket/lib/pocketActivityPresentation.ts'
import {compactReceiptAmount} from '../src/lib/paymentReceiptPdf.ts'
const raw='12.0445353'
for(const asset of ['USDC','USDT']) {
 assert.equal(pocketActivityAmount({amount:raw,assetSymbol:asset}),`12.04 ${asset}`)
 assert.equal(compactReceiptAmount(raw,asset),'12.04')
 assert.equal(compactReceiptAmount('0.000184',asset),'<0.01')
}
assert.equal(formatPocketDisplayAmount('12.1'),'12.10')
assert.equal(formatPocketPaymentAmount('0.074145'),'0.07')
assert.equal(formatPocketPaymentAmount('0'),'0.00')
assert.equal(compactReceiptAmount('0.123456','NVDAx'),'0.123456')
assert.equal(raw,'12.0445353')
console.log('PASS: stablecoin balances, quotes, activity and receipts use two decimals; small nonzero amounts stay visible; stock quantities retain precision.')

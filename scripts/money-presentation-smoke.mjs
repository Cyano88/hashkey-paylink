import assert from 'node:assert/strict'
import {currencyFirst,exactMoney,moneyParts} from '../src/lib/moneyPresentation.ts'
import {formatPocketAmountLabel} from '../src/pocket/lib/pocketAmountDisplay.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const values=[['1,433.19 NGN','NGN 1,433.19'],['1.500004 USDC','USDC 1.500004'],['-0.003610 USDC','USDC -0.003610'],['\u22121.05 USDC','USDC \u22121.05'],['\u2212USDC 1.05','USDC \u22121.05'],['<0.01 USDT','USDT <0.01'],['KES 100.00','KES 100.00'],['\u20a61,433.19','NGN 1,433.19'],['USD 25.00','USD 25.00'],['USDC 25.00','USDC 25.00'],['USD \u2014','USD \u2014']]
for(const[input,expected]of values){assert.equal(currencyFirst(input),expected);assert.equal(currencyFirst(expected),expected);assert.equal(moneyParts(input).map(p=>p.text).join(''),expected);assert(moneyParts(input).some(p=>p.currency))}
for(const value of ['0x'+'a'.repeat(64),'chk_payment_123','Order #123','15 Nov 2026, 00:06','Bank account ending 9696'])assert.equal(currencyFirst(value),value)
assert.equal(exactMoney('999999999999999.000001','USDC'),'USDC 999,999,999,999,999.000001')
assert.equal(exactMoney('0.000004','USDC'),'USDC 0.000004');assert.equal(exactMoney('0','NGN'),'NGN 0.00')
assert.equal(formatPocketAmountLabel('1.500004 USDC'),formatPocketAmountLabel('USDC 1.500004'))
const receipt={source:'hosted_checkout',type:'money_out',amount:'1.500004',asset:'USDC',chain:'base',createdAt:Date.now(),receiptId:'reference',txHash:'tx',payer:'payer',recipient:'Shop'}
assert.equal(paymentReceiptView(receipt).amount,'USDC 1.500004');assert.equal(receipt.amount,'1.500004')
console.log('PASS code-first presentation, identity, exact decimals, signed amounts, unknown placeholders, idempotence and unchanged payment inputs.')

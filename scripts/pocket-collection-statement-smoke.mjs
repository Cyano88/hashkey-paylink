import assert from 'node:assert/strict'
import {collectionPayments,collectionStatementCsv} from '../src/pocket/lib/pocketCollectionStatement.ts'
const c={eventId:'collection_test',title:'=HYPERLINK("bad")',kind:'usdc',paymentUrl:'',createdAt:1,updatedAt:1}
const row={eventId:c.eventId,txHash:'0xpaid',payer:'=BAD()',memo:'',amount:'2',chain:'base',ts:1700000000000,source:'collection',paycrestStatus:'confirmed'}
const other={...row,eventId:'other_collection',amount:'999'}
assert.equal(collectionPayments(c,[row,other]).length,1)
const csv=collectionStatementCsv(c,[row,other])
assert.ok(csv.includes("'=BAD()"));assert.ok(csv.includes('Successful'));assert.ok(!csv.includes('999'));assert.ok(!csv.includes('other_collection'))
const bank={...c,eventId:'bank_test',kind:'bank'}
const incoming={...row,eventId:'ngpos-bank_test',merchantId:'bank_test',source:'bank-receive',amountNgn:'200',fiatCurrency:'UGX',bankSettlementStatus:'settled',paycrestStatus:'settled'}
const bankCsv=collectionStatementCsv(bank,[incoming,other]);assert.ok(bankCsv.includes('UGX'));assert.ok(bankCsv.includes('200'));assert.ok(!bankCsv.includes('999'))
assert.equal(collectionPayments(bank,[incoming,other]).length,1)
console.log('Collection exports: scoped rows, incoming bank records, currencies and CSV formula protection passed.')

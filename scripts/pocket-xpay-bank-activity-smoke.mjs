import assert from 'node:assert/strict'
import {xpayBankActivityRows,xpayConversionHashes} from '../src/pocket/lib/pocketXPayBankActivity.ts'
import {mergePocketActivitySnapshot} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {verifiedXPayConversionHashes} from '../api/pocket/xpay-bank-store.ts'
import {isIncomingPosPayment,personalPocketActivity} from '../src/pocket/lib/pocketPurchaseKind.ts'
const hash='0x'+'1'.repeat(64),paymentHash='0x'+'2'.repeat(64)
const p={id:'payment',state:'successful',amount:'0.0037',symbol:'NVDAx',source:'payer',merchantName:'Merchant',fiatAmount:'1000.00',currency:'NGN',createdAt:1,payoutHash:paymentHash,bankDelivery:'pending',conversionHashes:[hash,paymentHash]}
assert.equal(xpayBankActivityRows([p]).length,1);assert.equal(xpayBankActivityRows([p])[0].assetSymbol,'NVDAx')
assert.equal(xpayBankActivityRows([p])[0].paycrestStatus,'successful');assert.equal(xpayBankActivityRows([p])[0].bankSettlementStatus,'pending')
assert.equal(xpayBankActivityRows([{...p,state:'refunded',bankDelivery:'refunded'}])[0].paycrestStatus,'refunded')
assert.equal(xpayBankActivityRows([{...p,bankDelivery:'refunding'}])[0].paycrestStatus,'refunding')
assert.equal(xpayBankActivityRows([{...p,state:'quoted'}]).length,0)
assert.equal(xpayConversionHashes([p]).size,2)
assert.deepEqual(verifiedXPayConversionHashes({state:'swap_submitted',swapHash:hash}),[])
assert.deepEqual(verifiedXPayConversionHashes({state:'swap_confirmed',swapHash:hash,receivedUnits:'100'}),[hash])
const row={eventId:'mint',txHash:hash,chain:'base',payer:'source',amount:'1',memo:'USDC received',ts:1,source:'wallet-deposit'}
const old={payments:[row,{...row,eventId:'unrelated',txHash:'0x'+'3'.repeat(64)}],merchants:[],collections:[]}
const next=mergePocketActivitySnapshot(old,{payments:[],merchants:[],collections:[],groupedTransactionHashes:[hash]})
assert.equal(next.payments.length,1);assert.equal(next.payments[0].eventId,'unrelated')
assert.equal(mergePocketActivitySnapshot(next,old).payments.length,1)
const outgoing=xpayBankActivityRows([p])[0]
const merchant={...outgoing,eventId:'merchant-payment',source:'xpay',direction:'in'}
const deposit={...merchant,eventId:'deposit',source:'wallet-transfer'}
assert.equal(isIncomingPosPayment(merchant),true)
assert.equal(isIncomingPosPayment(outgoing),false)
assert.deepEqual(personalPocketActivity([merchant,deposit,outgoing]).map(r=>r.eventId),[outgoing.eventId])
assert.deepEqual([merchant,outgoing].filter(isIncomingPosPayment).map(r=>r.eventId),[merchant.eventId])
assert.equal(personalPocketActivity([{...deposit,txHash:hash}]).length,1,'ordinary deposits remain personal')
console.log('PASS one XPay record, separate bank delivery, refund updates, only verified grouping hashes, and cached intermediate transfers cannot return after refresh.')
console.log('PASS merchant XPay receipts and duplicate transfer rows stay out of personal activity; outgoing purchases remain personal on either rail.')

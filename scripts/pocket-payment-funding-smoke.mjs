import {currentPocketActivityRow} from '../src/pocket/lib/pocketActivityPresentation.ts'
import {isPocketActivityRow} from '../src/pocket/lib/pocketSchemas.ts'
import assert from 'node:assert/strict'
import {groupPocketPaymentFunding,pocketFundingRoute} from '../src/pocket/lib/pocketPaymentFunding.ts'
import {mergePocketActivitySnapshot} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {mergePocketBridgeActivity} from '../src/pocket/lib/pocketBridgeActivity.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
const parent={eventId:'pocket-bill:bill1',merchantId:'bill1',source:'bills',billCategory:'airtime',txHash:'0xpaid',chain:'base',payer:'payer',amount:'1',memo:'Airtime',ts:1,direction:'out',paycrestStatus:'delivered'}
const bridge={...parent,eventId:'bridge1',source:'wallet-bridge',chain:'polygon',destination:'base',txHash:'0xsource',destinationTxHash:'0xmint',fundingParent:'bills:bill1',fundingPayment:{...parent,txHash:'',paycrestStatus:'processing'},paycrestStatus:'completed'}
const sent={...parent,eventId:'sent',source:'wallet-withdrawal',chain:'polygon',txHash:'0xsource'}
const received={...parent,eventId:'received',source:'wallet-deposit',direction:'in',txHash:'0xmint'}
const unrelated={...received,eventId:'unrelated',txHash:'0xunrelated'}
const standalone={...bridge,eventId:'standalone',txHash:'0xmanual',fundingParent:undefined,fundingPayment:undefined}
const grouped=groupPocketPaymentFunding([parent,bridge,sent,received,unrelated,standalone])
assert.equal(grouped.length,3);assert.ok(grouped.some(x=>x.eventId==='unrelated'));assert.ok(grouped.some(x=>x.eventId==='standalone'))
const paid=grouped.find(x=>x.eventId===parent.eventId);assert.equal(paid.paycrestStatus,'delivered');assert.equal(paid.paymentFunding.length,1)
assert.equal(pocketFundingRoute(paid.paymentFunding),'Polygon \u2192 Base')
const receipt=pocketActivityReceipt(paid,{allowPending:true});assert.equal(paymentReceiptView(receipt).rows.find(x=>x.label==='Payment funding').value,'Polygon \u2192 Base')
const pending=groupPocketPaymentFunding([bridge,sent,received]);assert.equal(pending.length,1);assert.equal(pending[0].txHash,'');assert.equal(pending[0].paycrestStatus,'processing');assert.equal(pending[0].bridge.source,'polygon')
const second={...bridge,eventId:'bridge2',chain:'arc',txHash:'0xarc',destinationTxHash:'0xmint2'}
assert.equal(pocketFundingRoute(groupPocketPaymentFunding([parent,bridge,second])[0].paymentFunding),'Polygon + Arc \u2192 Base')
const cached=mergePocketActivitySnapshot({payments:[parent,sent,received],merchants:[],collections:[]},{payments:pending,merchants:[],collections:[],groupedTransactionHashes:['0xsource','0xmint']})
assert.equal(cached.payments.length,1);assert.equal(cached.payments[0].paycrestStatus,'delivered')
const refreshed=mergePocketActivitySnapshot(cached,{payments:[parent],merchants:[],collections:[]});assert.equal(refreshed.payments[0].paymentFunding.length,1)
assert.equal(mergePocketBridgeActivity([paid],[{id:'bridge1',source:'polygon',destination:'base',amount:'1',txHash:'0xsource',createdAt:1,progress:'completed'}]).length,1)
console.log('PASS funding groups exact parent/hash links, preserves standalone transfers, recovery, final status, receipts and cache refreshes')

assert.equal(isPocketActivityRow(pending[0]),true);assert.equal(isPocketActivityRow({...pending[0],paymentFunding:undefined}),false)

const oldBank={...parent,eventId:'pocket-bank-payout:old',source:'bank-withdraw',providerReference:'intent-1',txHash:'',paycrestStatus:'pending'}
const bankDone={...oldBank,eventId:'ngpos-merchant',txHash:'0xfinal',paycrestStatus:'settled'}
assert.equal(currentPocketActivityRow(oldBank,[bankDone]),bankDone)
assert.equal(currentPocketActivityRow(oldBank,[{...bankDone,providerReference:'intent-other'}]),oldBank)

const closedBank={...oldBank,paycrestStatus:'failed',providerReference:'provider-id'}
const linkedBankBridge={...bridge,fundingParent:'bank-withdraw:intent-1',fundingPayment:oldBank}
const closedGrouped=groupPocketPaymentFunding([closedBank,linkedBankBridge])
assert.equal(closedGrouped.length,1);assert.equal(closedGrouped[0].paycrestStatus,'failed')

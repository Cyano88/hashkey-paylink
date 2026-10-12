import assert from 'node:assert/strict'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {pocketActivityTitle,pocketActivitySignedAmount} from '../src/pocket/lib/pocketActivityPresentation.ts'
for (const category of ['airtime','data','electricity','tv']) for (const asset of ['USDC','USDT']) {
 const row={source:'bills',eventId:'bill-fixture',chain:'base',txHash:'0x'+'a'.repeat(64),payer:'fixture',ts:Date.now(),amount:'0.741248',feeAmount:'0.001848',amountNgn:'1000',fiatCurrency:'NGN',assetSymbol:asset,direction:'out',billCategory:category,billProvider:category==='electricity'?'PHED':category==='tv'?'DSTV':'MTN',billTarget:'08123456789',billReference:'bill-reference',paycrestStatus:'delivered',billToken:category==='electricity'?'1234 5678 9012':undefined}
 const receipt=pocketActivityReceipt(row,{allowPending:true});assert(receipt)
 const view=paymentReceiptView(receipt)
 assert.equal(view.amount,'1,000.00 NGN')
 assert.equal(view.rows.find(r=>r.label==='Paid with').value,`0.74 ${asset}`)
 assert.equal(view.rows.find(r=>r.label==='Network').value,'Base')
 assert(view.rows.some(r=>r.value==='08123456789'))
 assert(view.rows.some(r=>r.label==='Fees'&&r.value.endsWith(asset)))
 assert.equal(pocketActivitySignedAmount(row),'\u22121,000.00 NGN')
 assert.equal(pocketActivityTitle(row),row.billProvider)
 if(category==='electricity')assert.equal(view.rows.find(r=>r.label==='Meter Token').value,'1234 5678 9012')
}
console.log('PASS: Airtime, data, electricity and TV receipts preserve actual assets, local headline, provider, target, network, fees and electricity token.')

assert.equal(pocketActivityTitle({source:'bank-withdraw',accountName:'Onoja Emmanuel',recipient:'0x123'}),'Onoja Emmanuel')
assert.equal(pocketActivityTitle({source:'bills',billCategory:'airtime',billProvider:'MTN Airtime VTU'}),'MTN')

import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {pocketMoneyNotification} from '../src/pocket/lib/pocketMoneyNotification.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import assert from 'node:assert/strict';import{checkoutActivityRows}from'../api/pocket/checkout-activity.ts';import{mergePocketActivityRows}from'../src/pocket/lib/pocketActivitySnapshot.ts';import{isPocketActivityRow}from'../src/pocket/lib/pocketSchemas.ts';import{pocketActivityTitle}from'../src/pocket/lib/pocketActivityPresentation.ts';import{pocketActivityReceipt}from'../src/pocket/lib/pocketReceipt.ts';
const payer='0x'+'a'.repeat(40),recipient='0x'+'b'.repeat(40),hash='0x'+'c'.repeat(64),time=Date.now();
const base={id:'chk_1234567890',partnerId:'dev',merchantName:'Shop',brandImageUrl:'https://shop.test/logo.png',title:'Order 34',amount:'1.43',asset:'USDC',network:'base',recipient,createdAt:new Date(time-900000).toISOString(),expiresAt:new Date(time-1000).toISOString(),checkoutMode:'human',payment:{status:'paid',txHash:hash,payer,amount:'1.43',confirmedAt:new Date(time-3000).toISOString()}};
for(const network of ['base','arbitrum','arc','ethereum','polygon','solana','bsc','xlayer'])for(const asset of ['USDC','USDT']){
const record={...base,network,asset,payment:{...base.payment,network}};const [row]=checkoutActivityRows(record,[payer]);assert.ok(isPocketActivityRow(row));assert.equal(pocketActivityTitle(row),'Web payment');assert.equal(row.paycrestStatus,'confirmed');assert.equal(row.assetSymbol,asset);assert.equal(row.merchantName,'Shop');assert.equal(row.receiptId,record.id);assert.equal(pocketMoneyNotification(row).title,'Web payment sent');assert.match(pocketMoneyNotification(row).body,/paid to Shop/);assert.equal(pocketActivityReceipt(row).settlementType,'hosted_checkout');
const raw={...row,eventId:'raw',source:'wallet-withdrawal',settlementType:'wallet_transfer',recipient,feeAmount:'0.015105',merchantId:undefined,receiptId:undefined};const unrelated={...raw,eventId:'other',amount:'2'};const old={...row,eventId:'old',source:'purchase'};
for(const rows of [[raw,old,row,unrelated],[row,unrelated,old,raw]]){const merged=mergePocketActivityRows([],rows);assert.equal(merged.filter(r=>r.amount==='1.43').length,1);assert.equal(merged.find(r=>r.amount==='1.43').source,'hosted_checkout');assert.equal(merged.find(r=>r.amount==='1.43').feeAmount,'0.015105');assert.ok(merged.some(r=>r.amount==='2'));}
assert.equal(checkoutActivityRows(record,['stranger']).length,0);assert.equal(checkoutActivityRows(record,[recipient])[0].direction,'in');assert.equal(pocketMoneyNotification(checkoutActivityRows(record,[recipient])[0]).title,'Web payment received');assert.equal(checkoutActivityRows({...record,payment:undefined},[payer]).length,0);
}
const local={...base,settlement:{mode:'ngn',amountNgn:'2000'},payout:{status:'processing'}};assert.equal(checkoutActivityRows(local,[payer])[0].paycrestStatus,'pending');assert.equal(checkoutActivityRows(local,[recipient]).length,0);assert.equal(checkoutActivityRows({...local,payout:{status:'settled'}},[payer])[0].paycrestStatus,'confirmed');
assert.equal(checkoutActivityRows({...base,network:'solana',payment:{...base.payment,payer:'AbC'}},['abc']).length,0);
console.log('PASS all 8 checkout networks, assets, expiry-independent paid truth, merchant/receipt identity, incoming/outgoing ownership, local payout status, exact duplicate suppression and fee preservation.');

const feeRecord={...base,network:'bsc',payment:{...base.payment,network:'bsc',fees:{payer:'merchant',platformFee:'0.003575',networkFee:'0.01153',netAmount:'1.414895'}}}
const out=checkoutActivityRows(feeRecord,[payer])[0],incoming=checkoutActivityRows(feeRecord,[recipient])[0]
assert.equal(out.amount,'1.43');assert.equal(out.feeAmount,'0');assert.equal(incoming.amount,'1.414895');assert.equal(incoming.feeAmount,'0.015105')
const raw={...out,eventId:'raw-net',source:'wallet-withdrawal',settlementType:'wallet_transfer',amount:'1.414895',recipient,merchantId:undefined}
assert.equal(mergePocketActivityRows([],[raw,out]).length,1)
const treasury={...raw,eventId:'raw-fee',recipient:EVM_PLATFORM_TREASURY,amount:'0.015105'}
const otherFee={...treasury,eventId:'unrelated-fee',amount:'0.02'}
for(const rows of [[raw,out,treasury,otherFee],[treasury,otherFee,out,raw]]){
 const merged=mergePocketActivityRows([],rows)
 assert.equal(merged.length,2)
 assert.equal(merged.find(r=>r.source==='hosted_checkout').feeAmount,'0')
 assert.ok(merged.some(r=>r.eventId==='unrelated-fee'))
}
assert.deepEqual(pocketActivityReceipt(out).merchantFees,feeRecord.payment.fees)
console.log('PASS merchant-paid order gross, merchant net and fee totals with raw net transfer deduplication.')

const merchantView=paymentReceiptView(pocketActivityReceipt(incoming));assert.equal(merchantView.rows.find(r=>r.label==='Order total').value,'1.43 USDC');assert.equal(merchantView.rows.find(r=>r.label==='Net proceeds').value,'1.414895 USDC')
assert(!paymentReceiptView(pocketActivityReceipt(out)).rows.some(r=>r.label.includes('fee')||r.label==='Fee'))
assert.equal(isPocketActivityRow({...out,merchantFees:{payer:'merchant',platformFee:'bad',networkFee:'0',netAmount:'1'}}),false)

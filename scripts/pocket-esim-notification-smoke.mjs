import assert from 'node:assert/strict'
import {pocketMoneyNotification} from '../src/pocket/lib/pocketMoneyNotification.ts'
import {esimActivityRow} from '../api/pocket/esim-activity.ts'
const base={id:'esim_notice',payer:'wallet',asset:'USDC',price:{subtotal:'5',platformFee:'0.01',total:'5.01'},packageLabel:'1 GB - Uganda',createdAt:1,updatedAt:9000,txHash:'0x'+'a'.repeat(64)}
for(const state of ['awaiting_payment','payment_received','ordering','order_unknown','provisioning','needs_review','refund_eligible','refunding'])assert.equal(pocketMoneyNotification(esimActivityRow({...base,state})),null,state)
for(const [state,title] of [['ready','eSIM ready'],['payment_failed','eSIM purchase failed'],['refunded','eSIM refunded']]){
 const notice=pocketMoneyNotification(esimActivityRow({...base,state}));assert.equal(notice.title,title);assert.equal(notice.occurredAt,9000);assert.equal(notice.path,'/activity?receipt=esim_notice');assert.equal(notice.tag,'pocket-payment:esim:esim_notice');assert(!notice.body.includes('sent on Base'))
}
console.log('PASS eSIM terminal notification wording, silent processing/refunds-in-progress, activity link, stable tag and status event time.')

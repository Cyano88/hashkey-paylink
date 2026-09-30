import assert from 'node:assert/strict'
import { requestActivityRows } from '../src/pocket/lib/pocketRequestActivity.ts'
const request={id:'preq_one',eventId:'one',direction:'incoming',amount:'2',network:'base',title:'Dinner',status:'accepted',transactionHash:'',createdAt:1,senderName:'Sender',recipientName:'Payer'}
const funding={eventId:'one',source:'request',chain:'base',amount:'2',txHash:'',paycrestStatus:'processing',paymentFunding:[{source:'polygon',destination:'base',txHash:'0xbridge',amount:'2',status:'completed'}]}
let rows=requestActivityRows([funding],[request])
assert.equal(rows.length,1);assert.equal(rows[0].paycrestStatus,'processing');assert.equal(rows[0].paymentFunding.length,1)
rows=requestActivityRows([funding,{source:'wallet-withdrawal',eventId:'raw',txHash:'0xpaid',chain:'base'}, {source:'wallet-deposit',eventId:'other',txHash:'0xother',chain:'base'}],[{...request,status:'paid',transactionHash:'0xpaid'}])
assert.equal(rows.length,2);assert.equal(rows.find(r=>r.source==='request').paycrestStatus,'paid');assert.equal(rows.find(r=>r.source==='request').paymentFunding.length,1);assert.ok(rows.find(r=>r.eventId==='other'))
console.log('PASS request history keeps one payment and its funding details before and after confirmation')

rows=requestActivityRows([funding],[{...request,status:'declined'}])
assert.equal(rows[0].paycrestStatus,'declined','Declined must override a stale funding status')

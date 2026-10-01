import assert from 'node:assert/strict'
import {giftReceiptActions,giftActivityRow} from '../api/pocket/gifts/receipts.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {collapsePocketAssetMoves} from '../src/pocket/lib/pocketAssetMoveActivity.ts'
const hash=n=>'0x'+String(n).repeat(64),addr=n=>'0x'+String(n).repeat(40)
const record={id:'g_'+'a'.repeat(22),ownerId:'sender',senderHandle:'@sender',senderAddress:addr(1),amount:'100',feeUnits:'250000',deployment:{network:'base'},state:'unfunded'}
assert.deepEqual(giftReceiptActions(record),[])
const funded={...record,state:'available',fundingHash:hash(1),fundingAt:1000}
const actions=giftReceiptActions(funded);assert.equal(actions.length,1);assert.equal(actions[0].ownerId,'sender')
const row=giftActivityRow({...actions[0],id:'row1'})
assert.equal(pocketActivityReceipt(row).title,'Gift funded');assert.equal(pocketActivityReceipt(row).feeAmount,'0.25')
const refunded={...funded,state:'refunded',refundHash:hash(2),refundAt:2000}
const refundActions=giftReceiptActions(refunded);assert.equal(refundActions.length,1,'refund updates the original sender gift')
const refundRow=giftActivityRow({...refundActions[0],id:'row1'})
assert.equal(pocketActivityReceipt(refundRow).status,'refunded');assert.equal(pocketActivityReceipt(refundRow).refundTxHash,hash(2))
const claimed={...funded,state:'claimed',claimRecipient:addr(2),settlementHash:hash(3),settlementAt:3000,claim:{userId:'recipient',walletAddress:addr(2)}}
const incoming=giftReceiptActions(claimed);assert.equal(incoming.length,2);assert.equal(incoming[1].ownerId,'recipient')
assert.equal(pocketActivityReceipt(giftActivityRow({...incoming[1],id:'row2'})).title,'Gift received')
assert.equal(giftReceiptActions({...claimed,claimRecipient:addr(3)}).length,1,'never credit an unmatched recipient')
assert.equal(giftReceiptActions({...claimed,settlementHash:undefined}).length,1,'no incoming receipt from state alone')
const raw=(chain,txHash)=>({...row,eventId:chain+txHash,source:'wallet-deposit',chain,txHash})
const collapsed=collapsePocketAssetMoves([refundRow,raw('base',hash(1)),raw('base',hash(2)),raw('polygon',hash(1)),raw('base',hash(4))])
assert.equal(collapsed.length,3,'only exact gift funding/refund legs collapse')
for(const value of giftReceiptActions(claimed))assert.ok(!JSON.stringify(value).includes('signature'))
console.log('PASS gift receipts: verified hashes only, correct account and fee, one refunded sender record, exact-chain underlying-transfer suppression.')

const fundedView=paymentReceiptView(pocketActivityReceipt(row));assert.equal(fundedView.badge,'Gift funded');assert(!fundedView.rows.some(r=>['To','Destination','From','Amount & narration','Type'].includes(r.label)));assert.equal(fundedView.rows.find(r=>r.label==='Gift status').value,'Ready to claim');
const senderClaim=giftActivityRow({...incoming[0],id:'row1'});const claimedView=paymentReceiptView(pocketActivityReceipt(senderClaim));assert.equal(claimedView.rows.find(r=>r.label==='To').value,addr(2));assert.equal(claimedView.rows.find(r=>r.label==='Gift status').value,'Claimed');
const incomingView=paymentReceiptView(pocketActivityReceipt(giftActivityRow({...incoming[1],id:'row2'})));assert.equal(incomingView.rows.find(r=>r.label==='From').value,'@sender');assert(!incomingView.rows.some(r=>r.label==='To'||r.label==='Destination'));
const unmatched=giftActivityRow({...giftReceiptActions({...claimed,claimRecipient:addr(3)})[0],id:'row1'});assert(!paymentReceiptView(pocketActivityReceipt(unmatched)).rows.some(r=>r.label==='To'));
console.log('PASS compact gift receipts: no invented destination, verified claimant only, sender shown on received gifts, funding distinct from claim.');

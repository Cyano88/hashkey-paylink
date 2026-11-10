import assert from 'node:assert/strict'
import fs from 'node:fs'
import {marketplaceSettlementReceipts} from '../api/marketplace/settlement-receipts.ts'
import {marketplaceReceiptActivity} from '../api/pocket/marketplace-activity.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {isPocketActivityRow} from '../src/pocket/lib/pocketSchemas.ts'
import {marketplaceReceiptEmail,marketplaceReceiptPdf} from '../api/marketplace/receipt-document.ts'
import {reconcileMarketplaceReceiptEmails} from '../api/marketplace/receipt-emails.ts'
import {queuePreparedReceiptEmail} from '../api/checkout-receipt-emails.ts'
import {activeReceiptSettings} from '../api/developer-receipt-settings.ts'
const payer='0x'+'11'.repeat(20),holding='0x'+'22'.repeat(20),seller='0x'+'33'.repeat(20),tx='0x'+'aa'.repeat(32),payoutTx='0x'+'bb'.repeat(32)
const origin={payerWallet:payer,holdingAddress:holding,fundingEvidenceId:'collection_a'}
const quote={quoteId:'quote_a',projectId:'project_a',paymentId:'payment_a',operationId:'payout_a',allocationId:'seller_a',beneficiaryId:'beneficiary_a',recipient:seller,asset:'USDC',network:'base',feePayer:'allocation',feePolicy:'fixed_success_only',debitUnits:'20000',recipientUnits:'16403',networkFeeUnits:'3597',issuedAt:1000,expiresAt:61000}
const book={plan:{projectId:'project_a',paymentId:'payment_a',network:'base',asset:'USDC'},fundingEvidence:'collection_a',collectionProof:{evidenceId:'collection_a'},refundCollection:origin,refundReservations:[{refundId:'refund_a',amountUnits:'30000',collection:origin,allocations:[{operationId:'refund_op',amountUnits:'30000'}]}],refundExecutions:[{refundId:'refund_a',state:'settled',transactionHash:tx,terminalEvidence:{receiptStatus:'success',blockNumber:'100',finalizedBlockNumber:'101',verifiedAt:2000},feeQuote:{networkFeeUnits:'3588'}}],operations:[{id:'refund_op',kind:'refund',status:'settled',units:'30000'},{id:'payout_a',kind:'payout',status:'settled',units:'20000'}],walletReservations:[{operationId:'payout_a',recipient:seller,amountUnits:'16403',quote}],walletReconciliations:[{status:'settled',evidence:{operationId:'payout_a',transferredUnits:'16403',transactionHash:payoutTx,sender:holding,recipient:seller,finalizedAt:2000}}]}
const state={books:[book],drafts:[]},receipts=marketplaceSettlementReceipts(state)
assert.equal(receipts.length,2)
assert.equal(receipts[0].amount,'0.03');assert.equal(receipts[0].feePayer,'marketplace')
assert.equal(receipts[1].networkFee,'0.003597');assert.equal(receipts[1].amount,'0.016403')
const broken=structuredClone(state);delete broken.books[0].walletReservations[0].quote
assert.deepEqual(marketplaceSettlementReceipts(broken).map(r=>r.kind),['refund'],'legacy payout must not suppress buyer refund')
const wrongRecipient=structuredClone(state);wrongRecipient.books[0].walletReconciliations[0].evidence.recipient=payer
assert.deepEqual(marketplaceSettlementReceipts(wrongRecipient).map(r=>r.kind),['refund'],'receipt must bind verified payout recipient')
const rows=marketplaceReceiptActivity(receipts,payer)
assert.equal(rows.length,1);assert.equal(rows[0].contextLabel,'Marketplace refund');assert.equal(rows[0].feeAmount,'0');assert.ok(isPocketActivityRow(rows[0]))
assert.equal(marketplaceReceiptActivity(receipts,'0x'+'44'.repeat(20)).length,0)
const raw={...rows[0],eventId:'raw',source:'wallet-deposit',memo:'USDC deposit',contextLabel:'From holding'}
const merged=mergePocketActivityRows([raw],rows);assert.equal(merged.length,1);assert.equal(merged[0].source,'marketplace-refund')
for(const change of [b=>b.refundExecutions[0].state='submitted',b=>b.refundExecutions[0].terminalEvidence.finalizedBlockNumber='99',b=>b.operations[0].status='unknown',b=>b.refundReservations[0].collection={...origin,payerWallet:seller}]){const copy=structuredClone(state);change(copy.books[0]);assert.equal(marketplaceSettlementReceipts(copy).filter(r=>r.kind==='refund').length,0)}
const copy=marketplaceReceiptEmail(receipts[0]);assert.match(copy.text,/Fee deducted from refund: 0 USDC/);assert.match(copy.text,/Refund gas payer: Marketplace refund fee balance/)
assert.ok(activeReceiptSettings({capabilities:['marketplace_payments'],operationalStatus:'active'}));assert.equal(activeReceiptSettings({capabilities:['marketplace_payments'],operationalStatus:'suspended'}),undefined)
let outbox={jobs:{}},queued=0
const outboxDeps={enabled:()=>true,from:()=> 'receipts@example.com',now:()=>3000,read:async()=>outbox,mutate:async fn=>outbox=fn(outbox)}
const deps={names:async()=>({project_a:'Example Marketplace'}),enabled:()=>true,now:()=>3000,activation:async()=>({startedAt:1500}),read:async()=>state,queued:async()=>new Set(Object.keys(outbox.jobs)),settings:async()=>({enabled:true}),recipient:async r=>r.kind==='refund'?'buyer@example.com':'seller@example.com',pdf:async()=>Buffer.from('fixture'),queue:async(...args)=>{queued++;return queuePreparedReceiptEmail(...args,outboxDeps)}}
await reconcileMarketplaceReceiptEmails(deps);await reconcileMarketplaceReceiptEmails(deps)
assert.equal(queued,2);assert.equal(Object.keys(outbox.jobs).length,2)
assert.deepEqual(Object.values(outbox.jobs).map(j=>j.input.to).sort(),['buyer@example.com','seller@example.com'])
assert.ok(Object.values(outbox.jobs).every(j=>j.input.subject.startsWith('Example Marketplace - ')))
assert.equal(marketplaceReceiptActivity([{...receipts[0],marketplaceName:'Example Marketplace'}],payer)[0].contextLabel,'Example Marketplace - Refund')
assert.match(marketplaceReceiptEmail({...receipts[0],marketplaceName:'<Test & Marketplace>'}).html,/&lt;Test &amp; Marketplace&gt;/)
outbox={jobs:{}};queued=0
await reconcileMarketplaceReceiptEmails({...deps,activation:async()=>({startedAt:2500})});assert.equal(queued,0,'no retroactive email')
await reconcileMarketplaceReceiptEmails({...deps,recipient:async()=>null});assert.equal(queued,0,'no fallback to developer email')
await assert.rejects(()=>queuePreparedReceiptEmail('invalid','project_a',{to:'bad\n@example.com',subject:'a',text:'a',html:'a',context:'test'},outboxDeps),/Verified/)
fs.mkdirSync('output/marketplace-receipts',{recursive:true})
for(const raw of receipts){const r={...raw,marketplaceName:'Example Marketplace'};const pdf=await marketplaceReceiptPdf(r);assert.ok(pdf.subarray(0,4).toString()==='%PDF');fs.writeFileSync('output/marketplace-receipts/'+r.kind+'.pdf',pdf);fs.writeFileSync('output/marketplace-receipts/'+r.kind+'.html',marketplaceReceiptEmail(r).html)}
console.log('PASS verified Marketplace receipt projection, owner scope, deposit deduplication, fees, recipient isolation, durable email idempotency, activation cutoff, and refund/payout PDF generation. No live emails sent.')

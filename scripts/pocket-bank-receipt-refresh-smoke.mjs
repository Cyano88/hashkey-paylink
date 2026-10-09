import assert from 'node:assert/strict'
import {parsePocketActivityRead} from '../src/pocket/api/pocketReadClient.ts'
import {mergePocketActivitySnapshot} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {currentPocketActivityRow} from '../src/pocket/lib/pocketActivityPresentation.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const signature='5L'+ 'Ab9m'.repeat(21)+'xy'
const hash='0x'+'a'.repeat(64)
const old={eventId:'ngpos-bank-fixture',source:'bank-withdraw',chain:'base',txHash:hash,payer:'fixture',memo:'Bank payout',amount:'1',ts:1,direction:'out',bankOrderId:'order-fixture',providerReference:'intent-fixture',handoffVerified:true,paycrestStatus:'settling',bankSettlementStatus:'settling'}
const settled={...old,assetSymbol:'USDT',paycrestStatus:'successful',bankSettlementStatus:'settled'}
const response={ok:true,payments:[settled],merchants:[],collections:[],groupedTransactionHashes:[signature.toLowerCase(),'0x'+'b'.repeat(64)]}
const parsed=parsePocketActivityRead(response)
assert.deepEqual(parsed.groupedTransactionHashes,response.groupedTransactionHashes)
const merged=mergePocketActivitySnapshot({payments:[old,{...old,eventId:'funding',source:'wallet-withdrawal',chain:'solana',txHash:signature}],merchants:[],collections:[]},parsed)
assert.equal(merged.payments.length,1,'bridge funding remains inside its parent receipt')
const selected=currentPocketActivityRow(old,merged.payments)
assert.equal(selected.bankSettlementStatus,'settled')
const receipt=pocketActivityReceipt(selected,{allowPending:true})
assert.equal(receipt.status,'successful')
assert.equal(receipt.asset,'USDT','refreshed bank receipt must retain the actual payment asset')
assert.equal(paymentReceiptView(receipt).rows.find(r=>r.label==='Bank delivery').value,'Delivered')
assert.equal(mergePocketActivitySnapshot(merged,{payments:[old],merchants:[],collections:[]}).payments[0].bankSettlementStatus,'settled','a late response cannot regress delivery')
assert.doesNotThrow(()=>parsePocketActivityRead({...response,groupedTransactionHashes:[signature]}))
for(const invalid of ['', '0x123', '0'.repeat(88),'a'.repeat(89),{},null])assert.throws(()=>parsePocketActivityRead({...response,groupedTransactionHashes:[invalid]}),/invalid/)
assert.throws(()=>parsePocketActivityRead({...response,payments:[{...settled,amount:undefined}]}),/invalid/,'payment validation remains strict')
console.log('PASS: Solana grouping keys accept settled bank refresh, open receipt becomes Delivered, funding stays grouped, stale settlement cannot regress, malformed data rejected')

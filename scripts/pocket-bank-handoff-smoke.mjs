import assert from 'node:assert/strict'
import {cachedPocketDirectLiquidity} from '../src/pocket/lib/pocketDirectLiquidity.ts'
import {pocketActivityReceipt,pocketActivityStatus} from '../src/pocket/lib/pocketReceipt.ts'
import {paymentReceiptOutcome,paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
const now=Date.now(),wallet={walletId:'fixture',address:'0x'+'1'.repeat(40)}
const row={key:'base',balance:2,status:'ok',known:true,stale:false,observedAt:now}
const snapshot={wallets:{base:wallet},displayRows:[row]}
assert.equal(cachedPocketDirectLiquidity(snapshot,'base',1500000n,now)?.route.kind,'direct')
for(const bad of [{...row,stale:true},{...row,status:'error'},{...row,known:false},{...row,observedAt:now-60001},{...row,observedAt:now+100},{...row,balance:1.49999999}])assert.equal(cachedPocketDirectLiquidity({...snapshot,displayRows:[bad]},'base',1500000n,now),null)
assert.equal(cachedPocketDirectLiquidity({...snapshot,wallets:{}},'base',1500000n,now),null)
const bank={eventId:'fixture',txHash:'0x'+'2'.repeat(64),chain:'base',payer:'fixture',memo:'Bank transfer',amount:'1',ts:now,source:'bank-withdraw',direction:'out',paycrestStatus:'pending'}
assert.equal(pocketActivityStatus(bank),'pending')
const handoff={...bank,handoffVerified:true,bankSettlementStatus:'pending'}
const receipt=pocketActivityReceipt(handoff)
assert.equal(paymentReceiptOutcome(receipt).state,'successful')
assert.equal(paymentReceiptView(receipt).rows.find(r=>r.label==='Bank delivery').value,'Processing')
assert.equal(pocketActivityStatus({...handoff,txHash:''}),'pending')
assert.equal(pocketActivityStatus({...handoff,bankSettlementStatus:'refunding'}),'reversing')
assert.equal(pocketActivityStatus({...handoff,bankSettlementStatus:'refunded'}),'reversed')
assert.equal(pocketActivityStatus({...handoff,bankSettlementStatus:'expired'}),'payout incomplete')
assert.equal(pocketActivityStatus({...handoff,bankSettlementStatus:'failed'}),'failed')
assert.equal(paymentReceiptView(pocketActivityReceipt({...handoff,bankSettlementStatus:'settled'})).rows.find(r=>r.label==='Bank delivery').value,'Delivered')
console.log('PASS fresh direct routing hints reject stale/insufficient balances; only verified bank handoffs succeed; bank delivery/refunds remain explicit')

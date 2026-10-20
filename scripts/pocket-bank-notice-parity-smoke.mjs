import assert from 'node:assert/strict'
import {pocketMoneyNotification as notice} from '../src/pocket/lib/pocketMoneyNotification.ts'
const row={eventId:'bank',source:'bank-withdraw',chain:'base',payer:'fixture',amount:'3.7',amountNgn:'5000',fiatCurrency:'NGN',accountName:'Recipient',ts:1000,statusUpdatedAt:2000,txHash:'0x'+'1'.repeat(64),bankOrderId:'order',direction:'out'}
for(const state of ['settled','completed','successful','success',' SETTLED ']){const n=notice({...row,bankSettlementStatus:state});assert.equal(n.title,'Bank transfer successful');assert.equal(n.path,'/activity?receipt=order');assert.equal(n.occurredAt,2000)}
for(const state of ['pending','settling','fulfilled','deposited','refunding','expired'])assert.equal(notice({...row,bankSettlementStatus:state}),null,state)
for(const state of ['failed','rejected','reverted'])assert.equal(notice({...row,bankSettlementStatus:state}).title,'Bank transfer failed')
for(const amountNgn of ['0','-1','NaN','Infinity',''])assert.equal(notice({...row,bankSettlementStatus:'settled',amountNgn}),null)
assert.equal(notice({...row,bankSettlementStatus:'refunded'}).title,'Refund completed')
console.log('PASS released bank notification terminal states, unresolved funded expiry, refund and receipt link')

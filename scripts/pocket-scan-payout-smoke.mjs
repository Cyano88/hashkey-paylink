import assert from 'node:assert/strict'
import {assertPocketScanPayoutPayable,pocketScanPayoutNeedsReview} from '../src/pocket/lib/pocketScanPayout.ts'
const now=Date.now(),order={intent_id:'quote',paycrest_order_id:'order',receive_address:'0x'+'1'.repeat(40),amount_usdc:'1',amount_ngn:'1500',status:'initiated',valid_until:new Date(now+120000).toISOString(),bank_last4:'1234'}
assert.doesNotThrow(()=>assertPocketScanPayoutPayable(order,now))
for(const status of ['deposited','pending','settled','refunded','expired','failed'])assert.throws(()=>assertPocketScanPayoutPayable({...order,status},now))
for(const valid_until of [undefined,'invalid',new Date(now+30000).toISOString()])assert.throws(()=>assertPocketScanPayoutPayable({...order,valid_until},now))
assert.throws(()=>assertPocketScanPayoutPayable({...order,tx_hash:'0x'+'a'.repeat(64)},now))
assert.equal(pocketScanPayoutNeedsReview(null,order),true)
assert.equal(pocketScanPayoutNeedsReview(order,{...order}),false)
for(const changed of [{amount_usdc:'2'},{amount_ngn:'1400'},{receive_address:'0x'+'2'.repeat(40)},{paycrest_order_id:'replacement'},{bank_last4:'5678'}])assert.equal(pocketScanPayoutNeedsReview(order,{...order,...changed}),true)
console.log('PASS: Scan payout rejects funded/closed/expired orders and requires review of every new or changed payout before approval.')

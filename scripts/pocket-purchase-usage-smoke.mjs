import assert from 'node:assert/strict'
import {purchaseAllowanceUsage} from '../api/pocket/purchase-allowance.ts'
const now=Date.parse('2026-11-15T12:00:00Z'),day='2026-11-15'
const charge=(id,units,provider='provider-'+id)=>({id,units,provider,binding:'fixture',day,state:'reserved'})
const ledger={charges:[charge('online',2000e6),charge('qr',1000e6,'wallet:qr'),charge('failed',500e6),{...charge('yesterday',500e6),day:'2026-11-14'},{...charge('refunded',500e6),state:'refunded'}]}
assert.equal(purchaseAllowanceUsage(ledger,[],true,now).usedUsd,3500)
assert.equal(purchaseAllowanceUsage(ledger,[],true,now).remainingUsd,3500)
const refund={intent_id:'online',paycrest_order_id:'provider-online',source:'hosted-checkout',status:'refunded'}
assert.equal(purchaseAllowanceUsage(ledger,[refund],true,now).usedUsd,1500)
for(const changed of [{...refund,status:'failed'},{...refund,paycrest_order_id:'wrong'},{...refund,source:'bank-withdraw'}])assert.equal(purchaseAllowanceUsage(ledger,[changed],true,now).usedUsd,3500)
assert.equal(purchaseAllowanceUsage(ledger,[],false,now).remainingUsd,0)
assert.equal(purchaseAllowanceUsage(ledger,[],true,Date.parse('2026-11-15T23:00:00Z')).usedUsd,0)
assert.equal(purchaseAllowanceUsage(undefined,[],true,now).remainingUsd,7000)
assert.equal(purchaseAllowanceUsage(ledger,[],true,now).resetsAt,'2026-11-15T23:00:00.000Z')
console.log('PASS shared online/QR usage, reserved failures, bound confirmed refunds, verification gate, fixed quote value and Lagos reset.')

import assert from 'node:assert/strict'
import {mergePaycrestOrder,paycrestTransactionReferences} from '../api/paycrest-order-state.ts'
import {recoverPaycrestFundingReference} from '../api/paycrest-reconcile.ts'
const funding='0x'+'1'.repeat(64),provider='0x'+'2'.repeat(64)
const order={intent_id:'fixture',paycrest_order_id:'provider',amount_usdc:'1',source_token:'USDT',status:'settled',updated_at:'2026-11-01T01:00:00Z',created_at:'2026-11-01T00:00:00Z',receive_address:'0x'+'3'.repeat(40),tx_hash:funding}
assert.deepEqual(paycrestTransactionReferences(order,{txHash:provider}),{tx_hash:funding,provider_tx_hash:provider})
assert.equal(paycrestTransactionReferences({...order,funding_tx_hash:funding,tx_hash:provider},{txHash:provider}).tx_hash,funding)
assert.equal(paycrestTransactionReferences({...order,tx_hash:undefined},{txHash:provider}).tx_hash,provider)
const verified={...order,funding_tx_hash:funding}
assert.equal(mergePaycrestOrder(verified,{...order,tx_hash:provider,updated_at:'2026-11-01T01:01:00Z'}).tx_hash,funding)
assert.throws(()=>mergePaycrestOrder(verified,{...order,funding_tx_hash:provider}),/cannot be replaced/)
let writes=0,proof
const dependencies={verify:async input=>{proof=input},mark:async input=>{writes++;return {...order,tx_hash:input.txHash,funding_tx_hash:input.txHash}}}
const repaired=await recoverPaycrestFundingReference({...order,tx_hash:provider},funding,dependencies)
assert.equal(repaired.tx_hash,funding);assert.equal(writes,1);assert.equal(proof.token,'USDT');assert.equal(proof.recipient,order.receive_address);assert.equal(proof.minAmount,'1')
await recoverPaycrestFundingReference(repaired,funding,dependencies);assert.equal(writes,1)
await assert.rejects(()=>recoverPaycrestFundingReference({...order,tx_hash:provider},funding,{...dependencies,verify:async()=>{throw Error('unverified')}}),/unverified/);assert.equal(writes,1)
console.log('PASS provider hash isolation, stale/concurrent updates preserve verified funding, conflicting proof rejected, canonical repair only and idempotency')

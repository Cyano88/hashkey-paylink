import assert from 'node:assert/strict'
import {paycrestActivityHashes,paycrestActivityFundingHash,mergeRegisteredPaycrestActivity} from '../api/ng-pos.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
const funding='0x'+'1'.repeat(64),settlement='0x'+'2'.repeat(64)
const order={intent_id:'order-a',paycrest_order_id:'provider-a',source:'bank-withdraw',tx_hash:settlement,raw:{transactionLogs:[{status:'crypto_deposited',tx_hash:funding},{status:'order_settled',tx_hash:settlement}]}}
assert.equal(paycrestActivityFundingHash(order),funding)
const base={eventId:'ngpos-owned',chain:'base',txHash:funding,ts:1000,amount:'1',payer:'fixture',memo:'fixture',source:'bank-withdraw'}
const provider={...base,txHash:paycrestActivityFundingHash(order),relatedTxHashes:paycrestActivityHashes(order),providerReference:order.intent_id,bankOrderId:order.paycrest_order_id,paycrestStatus:'successful',direction:'out',ts:2000}
const merged=mergeRegisteredPaycrestActivity([base,{...base,txHash:settlement,ts:1500}],[provider])
assert.equal(merged.length,1);assert.equal(merged[0].txHash,funding);assert.equal(merged[0].ts,1000);assert.equal(merged[0].paycrestStatus,'successful')
const foreign={...base,eventId:'ngpos-other'}
assert.equal(mergeRegisteredPaycrestActivity([foreign],[provider])[0].providerReference,undefined)
assert.equal(mergeRegisteredPaycrestActivity([{...base,chain:'arbitrum'}],[provider])[0].providerReference,undefined)
const cached=[base,{...provider,txHash:settlement},{...provider,eventId:'pocket-bank-payout:fixture',providerReference:order.paycrest_order_id,bankOrderId:undefined,txHash:settlement}]
const refreshed=mergePocketActivityRows(cached,merged)
assert.equal(refreshed.length,1);assert.equal(refreshed[0].txHash,funding);assert.equal(refreshed[0].ts,1000)
assert.equal(mergePocketActivityRows([base],[{...provider,providerReference:'other',bankOrderId:'other-provider',txHash:'0x'+'3'.repeat(64)}]).length,2)
console.log('PASS funding/settlement aliases merge once, receipt identity preserved, chain and resource boundaries enforced, stale duplicates retired.')

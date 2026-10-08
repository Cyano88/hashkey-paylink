import assert from 'node:assert/strict'
import {PAYCREST_BASE_USDT as asset,verifyPaycrestBaseUsdtCatalogue,quotePaycrestBaseUsdt,buildPaycrestBaseUsdtOrder} from '../api/paycrest-usdt.ts'
assert.deepEqual(verifyPaycrestBaseUsdtCatalogue([asset]),asset)
for(const rows of [[],[asset,asset],[{...asset,symbol:'USDC'}],[{...asset,network:'arbitrum-one'}],[{...asset,decimals:18}],[{...asset,contractAddress:'0x'+'1'.repeat(40)}]])assert.throws(()=>verifyPaycrestBaseUsdtCatalogue(rows))
let calls=0
const dependencies={support:async()=>asset,rate:async request=>{calls++;assert.deepEqual(request,{network:'base',token:'USDT',amount:'10',fiat:'NGN'});return 1400}}
assert.equal((await quotePaycrestBaseUsdt({amount:'10',fiat:'NGN'},dependencies)).rate,1400)
for(const amount of ['0','-1','1e3','0.0000001','01','NaN'])await assert.rejects(quotePaycrestBaseUsdt({amount,fiat:'NGN'},dependencies))
assert.equal(calls,1)
await assert.rejects(quotePaycrestBaseUsdt({amount:'10',fiat:'NGN'},{...dependencies,support:async()=>{throw Error('unavailable')}}),/unavailable/)
assert.equal(calls,1)
const input={amountFiat:'10000',fiat:'NGN',refundAddress:'0x'+'1'.repeat(40),reference:'payout-fixture',institution:'OPAY',accountIdentifier:'0123456789',accountName:'TEST CUSTOMER'}
const order=buildPaycrestBaseUsdtOrder(input)
assert.equal(order.source.currency,'USDT');assert.equal(order.source.network,'base');assert.equal(order.amountIn,'fiat');assert.equal(order.senderFeePercent,'0.25')
assert.equal(buildPaycrestBaseUsdtOrder({...input,fiat:'UGX'}).destination.currency,'UGX')
for(const patch of [{fiat:'USD'},{amountFiat:'1.001'},{refundAddress:'0x'+'0'.repeat(40)},{reference:'../bad'},{accountName:''}])assert.throws(()=>buildPaycrestBaseUsdtOrder({...input,...patch}))
console.log('PASS: Base USDT contract/precision binding, USDT-specific quote, provider failure, fiat/order/fee validation; no orders posted.')

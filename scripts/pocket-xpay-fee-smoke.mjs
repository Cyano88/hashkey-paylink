import {build} from 'esbuild'
import assert from 'node:assert/strict'
await build({entryPoints:['api/pocket/xpay-fee.ts'],outfile:'.codex-temp/xpay-fee-test.mjs',bundle:true,format:'esm',platform:'node',packages:'external'})
const {xpaySenderFee,assertXPaySenderFee}=await import('../.codex-temp/xpay-fee-test.mjs')
assert.equal(xpaySenderFee().senderFeePercent,'0.25')
assert.match(xpaySenderFee().senderFeeAddress,/^0x[0-9a-fA-F]{40}$/)
const valid={amount:'1',senderFee:'0.0025',senderFeePercent:'0.25'}
assert.doesNotThrow(()=>assertXPaySenderFee(valid))
assert.doesNotThrow(()=>assertXPaySenderFee({...valid,amount:'0.736603',senderFee:'0.001842'}))
assert.doesNotThrow(()=>assertXPaySenderFee({...valid,amount:'0.736603',senderFee:'0.0018415075',senderFeePercent:'0.2500'}))
// Live provider response: requested 0.25%, rounded to four decimals.
assert.doesNotThrow(()=>assertXPaySenderFee({...valid,amount:'0.734198',senderFee:'0.0018'}))
assert.doesNotThrow(()=>assertXPaySenderFee({...valid,amount:'0.74',senderFee:'0.0019'}))
assert.throws(()=>assertXPaySenderFee({...valid,amount:'0.734198',senderFee:'0.0019'}))
assert.throws(()=>assertXPaySenderFee({...valid,amount:'0.734198',senderFee:'0.0022',senderFeePercent:'0.3'}))
for(const change of [{senderFeePercent:'0'},{senderFee:'0'},{senderFee:'0.005'},{amount:'-1'},{senderFee:'NaN'},{senderFeeAddress:'0x'+'1'.repeat(40)}])assert.throws(()=>assertXPaySenderFee({...valid,...change}))
console.log('PASS XPay 0.25% provider fee: explicit existing treasury, fee echo, rounding, omitted/duplicate/redirected fee rejection.')

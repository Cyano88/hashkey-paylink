import assert from 'node:assert/strict'
import { paymentBalanceError } from '../api/payment-balance-error.ts'
assert.equal(paymentBalanceError(3_000_000n,1_000_000n,800_000n,'gross'),null)
const high=paymentBalanceError(3_000_000n,1_000_000n,2_100_000n,'gross')
assert.equal(high.feeDetails.totalUnits,'3102500')
assert.equal(high.feeDetails.platformFeeUnits,'2500')
assert.match(high.error,/3.1025 USDC.*2.1 network.*0.0025 platform.*3 USDC/)
assert.equal(paymentBalanceError(3_102_500n,1_000_000n,2_100_000n,'gross'),null)
const wrong=paymentBalanceError(500_000n,1_000_000n,0n,'gross')
assert.equal(wrong.feeDetails.availableUnits,'500000')
assert.equal(paymentBalanceError(1_000_000n,1_000_000n,0n,'gross',true),null)
console.log('PASS exact amount-plus-fees rejection, sufficient 3-to-1 send, exact boundary, authoritative balance and fee exemption. No fee calculation changed.')

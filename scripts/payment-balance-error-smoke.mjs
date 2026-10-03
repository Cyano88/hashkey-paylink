import assert from 'node:assert/strict'
import { paymentBalanceError } from '../api/payment-balance-error.ts'
assert.equal(paymentBalanceError(3_000_000n,1_000_000n,800_000n,'gross'),null)
const high=paymentBalanceError(3_000_000n,1_000_000n,2_100_000n,'gross')
assert.equal(high.feeDetails.totalUnits,'3102500')
assert.equal(high.feeDetails.platformFeeUnits,'2500')
assert.equal(high.error,"Add 0.11 USDC to cover this send and fees.")
assert.equal(paymentBalanceError(3_102_500n,1_000_000n,2_100_000n,'gross'),null)
const wrong=paymentBalanceError(500_000n,1_000_000n,0n,'gross')
assert.equal(wrong.feeDetails.availableUnits,'500000')
assert.equal(paymentBalanceError(1_000_000n,1_000_000n,0n,'gross',true),null)
console.log('PASS exact amount-plus-fees rejection, sufficient 3-to-1 send, exact boundary, authoritative balance and fee exemption. No fee calculation changed.')

assert.equal(paymentBalanceError(1177228n,500000n,2209219n,'gross').error,'Add 1.54 USDC to cover this send and fees.')
assert.equal(paymentBalanceError(1002499n,1000000n,0n,'gross').error,'Add 0.01 USDC to cover this send and fees.')

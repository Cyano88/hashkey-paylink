import assert from 'node:assert/strict'
import {paymentFundingMinimum} from '../src/lib/paymentFundingMinimum.ts'
import {paymentBalanceError} from '../api/payment-balance-error.ts'
const error=paymentBalanceError(434491n,1500000n,0n,'gross')
assert.equal(paymentFundingMinimum(error),1503750n)
assert.equal(((paymentFundingMinimum(error)-434491n+9999n)/10000n)*10000n,1070000n)
const feesOnly=paymentBalanceError(1504000n,1500000n,10000n,'gross')
assert.equal(paymentFundingMinimum(feesOnly),1513750n)
assert.equal(paymentFundingMinimum(Error('Add 100 USDC')),null)
assert.equal(paymentFundingMinimum({...error,feeDetails:{...error.feeDetails,totalUnits:'2'}}),null)
assert.equal(paymentFundingMinimum({...error,feeDetails:{...error.feeDetails,totalUnits:'invalid'}}),null)
assert.equal(paymentFundingMinimum(null),null)
console.log('Funding minimum: reported Base balance, fee-only shortfall, malformed and unstructured failures passed')

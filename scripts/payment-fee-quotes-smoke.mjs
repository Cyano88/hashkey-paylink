import assert from 'node:assert/strict'
import {paymentFeeBreakdown} from '../src/lib/platformFees.ts'
import {createPaymentFeeQuote,verifyPaymentFeeQuote} from '../api/payment-fee-quotes.ts'
import {nativeFeeToUsdcUnits} from '../api/payment-network-fees.ts'
const key='synthetic-test-key-not-production-123456789'
assert.deepEqual(paymentFeeBreakdown(100_000_000n,800_000n),{platformFee:250_000n,networkFee:800_000n,treasury:1_050_000n,recipient:100_000_000n,total:101_050_000n})
assert.equal(paymentFeeBreakdown(1_000_000n).platformFee,2500n)
assert.equal(paymentFeeBreakdown(1n).platformFee,0n)
assert.equal(paymentFeeBreakdown(1_000_000n,0n,'gross',true).total,1_000_000n)
assert.throws(()=>paymentFeeBreakdown(1n,2n,'net'))
assert.throws(()=>paymentFeeBreakdown(-1n))
assert.equal(nativeFeeToUsdcUnits('0.0001',3000n*100_000_000n),300_000n)
const binding={chain:'base',walletId:'synthetic-wallet',walletAddress:'0x1111111111111111111111111111111111111111',recipient:'0x2222222222222222222222222222222222222222',amountUnits:'100000000',mode:'gross'}
const {quote,token}=createPaymentFeeQuote(binding,800_000n,false,1000,key)
assert.deepEqual(verifyPaymentFeeQuote(token,binding,2000,key),quote)
for(const delta of [{chain:'arbitrum'},{walletId:'other'},{amountUnits:'100000001'},{recipient:binding.walletAddress},{walletAddress:binding.recipient},{mode:'net'}])assert.throws(()=>verifyPaymentFeeQuote(token,{...binding,...delta},2000,key))
assert.throws(()=>verifyPaymentFeeQuote(token,binding,121000,key))
assert.throws(()=>verifyPaymentFeeQuote(token+'x',binding,2000,key))
assert.throws(()=>verifyPaymentFeeQuote(token,binding,2000,key+'other'))
console.log('25 bps arithmetic, fee totals, exemption arithmetic, signature integrity, binding and expiry passed.')

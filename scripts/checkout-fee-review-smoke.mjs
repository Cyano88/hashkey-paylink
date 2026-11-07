import assert from 'node:assert/strict'
import {checkoutFeeReviewChanged} from '../src/lib/checkoutFeeReview.ts'
import {createPaymentFeeQuote} from '../api/payment-fee-quotes.ts'
const binding={checkoutId:'chk_fixture123',purpose:'payment',asset:'USDT',chain:'arbitrum',walletId:'wallet',walletAddress:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),amountUnits:'2290000',mode:'net'}
const first=createPaymentFeeQuote(binding,1000n,false,Date.now(),'s'.repeat(32)).quote
const next=createPaymentFeeQuote(binding,1100n,false,Date.now(),'s'.repeat(32)).quote
assert.notEqual(first.recipientUnits,next.recipientUnits)
assert.equal(first.totalUnits,next.totalUnits)
assert.equal(checkoutFeeReviewChanged(first,next,true),false,'merchant-paid gas movement does not require the payer to approve the same amount repeatedly')
assert.equal(checkoutFeeReviewChanged(first,{...next,totalUnits:'2290001'},true),true,'a payer debit change always requires review')
assert.equal(checkoutFeeReviewChanged(first,next,false),true,'payer-paid settlement changes still require review')
assert.equal(checkoutFeeReviewChanged(first,first,false),false)
console.log('PASS merchant-paid dynamic fee review: unchanged payer amount proceeds; changed payer debit remains guarded; settlement fees remain present.')

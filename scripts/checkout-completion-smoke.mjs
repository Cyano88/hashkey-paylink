import assert from 'node:assert/strict'
import { checkoutCompletion } from '../src/lib/checkoutCompletion.ts'

assert.equal(checkoutCompletion({transferConfirmed:true,checkoutVerified:true,fundingComplete:false}), 'pending', 'USDC arriving at a bridge is not completed Polymarket funding')
assert.equal(checkoutCompletion({transferConfirmed:true,checkoutVerified:false,fundingComplete:true}), 'pending', 'bridge completion cannot bypass hosted checkout verification')
assert.equal(checkoutCompletion({transferConfirmed:true,checkoutVerified:true,fundingComplete:true}), 'successful')
assert.equal(checkoutCompletion({transferConfirmed:true,payoutSettled:false}), 'pending', 'a crypto transfer does not prove local bank delivery')
assert.equal(checkoutCompletion({transferConfirmed:true,payoutSettled:true}), 'successful')
assert.equal(checkoutCompletion({transferConfirmed:false,checkoutVerified:true,fundingComplete:true}), 'pending')
assert.equal(checkoutCompletion({transferConfirmed:true,reverted:true}), 'failed')
console.log('PASS: transfer, project verification, bank delivery and funding proofs must agree; reverted transactions never show success.')

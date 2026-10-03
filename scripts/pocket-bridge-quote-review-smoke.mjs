import assert from 'node:assert/strict'
import {bridgeQuoteNeedsReview} from '../src/pocket/lib/pocketBridgeQuoteReview.ts'
const q={source:'base',destination:'arc',amount:'1',fee:'0.1',total:'1.1',receive:'1',destinationAddress:'0xabc',expiresAt:1}
assert.equal(bridgeQuoteNeedsReview(q,{...q,expiresAt:2}),false)
assert.equal(bridgeQuoteNeedsReview(q,{...q,total:'1.100001'}),true)
assert.equal(bridgeQuoteNeedsReview(q,{...q,receive:'0.999999'}),true)
assert.equal(bridgeQuoteNeedsReview(q,{...q,total:'1.05'}),false)
assert.equal(bridgeQuoteNeedsReview(q,{...q,amount:'1.0'}),false)
for(const patch of [{destination:'ethereum'},{destinationAddress:'0xdef'},{amount:'2'},{total:'bad'}])assert.equal(bridgeQuoteNeedsReview(q,{...q,...patch}),true)
console.log('PASS bridge requote retains reviewed route, recipient and amount; worse fees/output require review; harmless expiry refresh remains allowed.')

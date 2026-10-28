import assert from 'node:assert/strict'
import {checkoutSecondsLeft} from '../src/components/CheckoutExpiry.tsx'
const now=Date.UTC(2026,9,28,12),expiry=new Date(now+15*60*1000).toISOString()
assert.equal(checkoutSecondsLeft(expiry,now),900)
assert.equal(checkoutSecondsLeft(expiry,now+14*60*1000),60)
assert.equal(checkoutSecondsLeft(expiry,now+899001),1)
assert.equal(checkoutSecondsLeft(expiry,now+900000),0)
assert.equal(checkoutSecondsLeft(expiry,now+999999),0)
assert.equal(checkoutSecondsLeft(undefined,now),null)
assert.equal(checkoutSecondsLeft('invalid',now),null)
console.log('Countdown: 15-minute deadline, elapsed/reopened time, final second and expiry passed')

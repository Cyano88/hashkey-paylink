import assert from 'node:assert/strict'
import {xpayBankProgress} from '../src/pocket/lib/pocketXPayBankProgress.ts'
import {xpayProgressSteps} from '../src/pocket/lib/pocketXPayProgress.ts'
const view=e=>xpayBankProgress({hasSwap:true,...e})
for(const state of ['quoted','approved','swap_authorized'])assert.equal(view({state}).swap,'waiting')
assert.equal(view({state:'swap_submitted'}).swap,'waiting')
assert.equal(view({state:'swap_submitted',swapHash:'verified broadcast'}).swap,'submitted')
assert.deepEqual(view({state:'bridging',bridge:{state:'burn_authorized'}}),{swap:'confirmed',bridge:'waiting',payment:'waiting'})
assert.equal(view({state:'bridging',bridge:{state:'burn_submitted',burnHash:'hash'}}).bridge,'submitted')
assert.equal(view({state:'bridging',bridge:{state:'attested',burnHash:'hash'}}).bridge,'submitted')
assert.equal(view({state:'bridging',bridge:{state:'mint_failed',burnHash:'hash'}}).bridge,'failed')
for(const state of ['payout_ready','payout_requested','payout_submitted'])assert.equal(view({state}).payment,'waiting')
assert.equal(view({state:'payout_submitted',payoutHash:'hash'}).payment,'submitted')
assert.equal(view({state:'successful',payoutHash:'hash'}).payment,'confirmed')
assert.equal(view({state:'failed',failureStage:'payment'}).bridge,'confirmed')
assert.equal(xpayBankProgress({state:'bridging',hasSwap:false}).swap,undefined)
assert.equal(xpayProgressSteps(view({state:'payout_submitted'})).some(s=>s.active),false)
console.log('PASS XPay progress uses broadcast evidence, keeps approval requests waiting, requires Base arrival before bridge completion, and omits swap for USDC.')

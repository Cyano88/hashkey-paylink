import assert from 'node:assert/strict'
import {hasXPayBankFunding} from '../api/pocket/xpay-bank-history.ts'
for(const status of ['initiated','expired','failed','cancelled'])assert.equal(hasXPayBankFunding({status}),false)
for(const status of ['settled','refunding','refunded'])assert.equal(hasXPayBankFunding({status}),true)
for(const status of ['initiated','pending','failed'])assert.equal(hasXPayBankFunding({status,tx_hash:'0x'+'a'.repeat(64)}),true)
assert.equal(hasXPayBankFunding({status:'initiated',tx_hash:'invalid'}),false)
console.log('PASS merchant history: unused/replaced quotes excluded; submitted, failed-after-funding and refund records retained.')

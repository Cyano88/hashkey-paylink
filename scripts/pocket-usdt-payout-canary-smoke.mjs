import assert from 'node:assert/strict'
import {usdtPayoutAllowed} from '../api/pocket/usdt-payout-gate.ts'
const wallet='0x'+'1'.repeat(40),account='8106849696',bankCode='fixture'
const env={POCKET_USDT_PAYOUT_CANARY:JSON.stringify({wallet,account,bankCode,expiresAt:2000})}
const input={wallet,account,bankCode,amount:'1000'}
assert.equal(usdtPayoutAllowed(input,env,1000),true)
for(const changed of [{wallet:'0x'+'2'.repeat(40)},{account:'1111111111'},{bankCode:'other'},{amount:'1001'},{amount:'0'},{amount:'-1'},{amount:'NaN'},{amount:'1000.001'}])assert.equal(usdtPayoutAllowed({...input,...changed},env,1000),false)
assert.equal(usdtPayoutAllowed(input,env,2000),false)
assert.equal(usdtPayoutAllowed(input,{},1000),false)
assert.equal(usdtPayoutAllowed(input,{POCKET_USDT_PAYOUT_ENABLED:'true'},1000),true)
console.log('PASS: payout canary binds wallet, bank, account, NGN amount and expiry.')

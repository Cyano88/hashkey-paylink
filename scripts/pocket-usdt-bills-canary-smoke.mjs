import assert from 'node:assert/strict'
import {usdtBillsAllowed,usdtBillsCanaryQuoteAllowed} from '../api/pocket/bills-asset.ts'
const now=1000,wallet='0x'+'1'.repeat(40),phone='08106849696'
const env={POCKET_USDT_BILLS_CANARY:JSON.stringify({wallet,phone,expiresAt:2000})}
const quote={wallet,phone,country:'NG',category:'airtime',amountNgn:'100',amount:'0.074'}
assert.equal(usdtBillsAllowed(wallet,{},now),false)
assert.equal(usdtBillsAllowed(wallet,env,now),true)
assert.equal(usdtBillsAllowed('0x'+'2'.repeat(40),env,now),false)
assert.equal(usdtBillsAllowed(wallet,env,2001),false)
assert.equal(usdtBillsCanaryQuoteAllowed(quote,env,now),true)
for(const changed of [{wallet:'0x'+'2'.repeat(40)},{phone:'08011111111'},{country:'UG'},{category:'data'},{amountNgn:'101'},{amount:'0.1'}])assert.equal(usdtBillsCanaryQuoteAllowed({...quote,...changed},env,now),false)
assert.equal(usdtBillsCanaryQuoteAllowed(quote,{},now),false)
assert.equal(usdtBillsAllowed(wallet,{POCKET_USDT_BILLS_ENABLED:'true'},now),true)
console.log('PASS expiring canary: wallet, phone, country, category, NGN cap and total-debit cap; general rollout stays disabled.')

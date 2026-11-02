import assert from 'node:assert/strict'
import {quoteBridgeMaximum} from '../api/pocket/bridge-max-quote.ts'
const now=Date.now()
for(const decimals of [6,9,18]){
 const unit=10n**BigInt(decimals),balance=unit*5n,fee=unit/50n
 const result=await quoteBridgeMaximum({balanceUnits:balance,now:()=>now,quote:async amount=>({quote:{amount:String(amount)},amountUnits:amount,totalUnits:amount+fee,expiresAt:now+30000})})
 assert.equal(result.amountUnits,balance-fee);assert.equal(result.totalUnits,balance)
 const percentage=await quoteBridgeMaximum({balanceUnits:balance,now:()=>now,quote:async amount=>{const total=amount+fee+(amount*10n+9999n)/10000n;if(total>balance)throw Object.assign(Error('balance'),{code:'insufficient_balance',maximumAmountUnits:String(amount-(total-balance))});return {quote:{},amountUnits:amount,totalUnits:total,expiresAt:now+30000}}})
 assert.ok(percentage.totalUnits<=balance);assert.ok(percentage.unspentUnits<=1n)
}
for(const code of ['route_unavailable','amount_too_low','rate_limited','provider_unavailable']){let calls=0;const error=Object.assign(Error(code),{code});await assert.rejects(()=>quoteBridgeMaximum({balanceUnits:100n,quote:async()=>{calls++;throw error}}),e=>e===error);assert.equal(calls,1)}
await assert.rejects(()=>quoteBridgeMaximum({balanceUnits:1n,quote:async amount=>({quote:{},amountUnits:amount,totalUnits:amount+2n,expiresAt:now+30000})}),e=>e.code==='max_quote_unavailable'||e.code==='insufficient_balance')
await assert.rejects(()=>quoteBridgeMaximum({balanceUnits:100n,now:()=>now,quote:async amount=>({quote:{},amountUnits:amount,totalUnits:amount,expiresAt:now-1})}),e=>e.code==='quote_expired')
console.log('PASS fee-inclusive Max: exact 6/9/18 decimals, fixed and proportional fees, provider insufficiency hints, expired quotes and unchanged no-route/minimum/rate-limit/outage errors. Fixtures only.')

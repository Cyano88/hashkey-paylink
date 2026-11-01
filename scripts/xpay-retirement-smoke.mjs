import assert from 'node:assert/strict'
import {assertUnusedXPayQuote} from '../api/pocket/unused-xpay-quote.ts'
const base={intent:{kind:'pos_settlement',state:'needs_review',failureCode:'PAYOUT_RECORD_UNAVAILABLE',ownerId:'owner',resourceId:'quote',amount:'1',asset:'USDC',metadata:{merchantId:'merchant'}},quote:{intent_id:'quote',merchant_id:'merchant',source:'pos',xpay_checkout_id:'xp_fixture',estimated_amount_usdc:'1',expires_at:'2026-10-01T00:00:00Z'},merchant:{owner_id:'owner'},ledger:[{state:'prepared'},{state:'needs_review'}],order:null,now:Date.parse('2026-11-01T00:00:00Z')}
assert.doesNotThrow(()=>assertUnusedXPayQuote(base))
for(const patch of [{order:{}},{quote:undefined},{merchant:{owner_id:'other'}},{ledger:[]},{ledger:[{state:'submitted'}]},{ledger:[{state:'prepared',transaction_hash:'0xproof'}]},{now:0}])assert.throws(()=>assertUnusedXPayQuote({...base,...patch}))
for(const patch of [{transactionHash:'0xproof'},{providerReference:'provider'},{state:'submitted'},{state:'authorized'},{failureCode:'OTHER_REVIEW'},{amount:'2'},{asset:'USDT'}])assert.throws(()=>assertUnusedXPayQuote({...base,intent:{...base.intent,...patch}}))
console.log('PASS unused XPay quote guard rejects funded, mismatched, active, missing and unrelated review evidence')

const {resolvePocketRoute}=await import('../src/pocket/lib/pocketRoutes.ts')
for(const route of ['/move/pos','/move/pos/manage'])assert.deepEqual(resolvePocketRoute(route),{section:'home',view:'xpay'})
console.log('PASS legacy setup routes open XPay')

import assert from 'node:assert/strict'
import {ALLOWANCE_DAY_POLICY,allowanceDay,currentAllowanceCharge,currentAllowanceTimestamp,nextAllowanceReset} from '../src/lib/allowanceDay.ts'
import {reserveCheckoutBuyer} from '../api/checkout-buyer-allowance.ts'
import {reserveAllowance} from '../api/pocket/transfer-allowance.ts'
import {purchaseAllowanceUsage} from '../api/pocket/purchase-allowance.ts'
const before=Date.parse('2026-11-15T22:59:59Z'),lagosReset=Date.parse('2026-11-15T23:00:00Z'),utcReset=Date.parse('2026-11-16T00:00:00Z')
assert.equal(allowanceDay(lagosReset),'2026-11-15');assert.equal(nextAllowanceReset(before),utcReset)
const previous={day:'2026-11-15'},overlap={day:'2026-11-16'}
assert(currentAllowanceCharge(previous,lagosReset));assert(currentAllowanceCharge(overlap,lagosReset));assert(!currentAllowanceCharge({...overlap,dayPolicy:ALLOWANCE_DAY_POLICY},lagosReset));assert(!currentAllowanceCharge(previous,utcReset))
assert(currentAllowanceTimestamp({createdAt:Date.parse('2026-11-14T23:30:00Z')},before),'Legacy Bills usage must not vanish mid-window')
assert(!currentAllowanceTimestamp({createdAt:Date.parse('2026-11-14T23:30:00Z'),allowanceDayPolicy:ALLOWANCE_DAY_POLICY},before))
const order=id=>({source:'hosted-checkout',intent_id:id,paycrest_order_id:'wallet:'+id,merchant_id:'merchant',receive_address:'0xabc',refund_address:'0xdef',amount_usdc:'7000',amount_ngn:'1',fiat_currency:'NGN'})
const input={order:order('one'),dailyUnits:7000e6,transferUnits:7000e6,now:before}
let ledger=reserveCheckoutBuyer(undefined,input);assert.equal(ledger.charges[0].dayPolicy,ALLOWANCE_DAY_POLICY)
assert.throws(()=>reserveCheckoutBuyer(ledger,{...input,order:order('two'),now:lagosReset}),e=>e.code==='CHECKOUT_DAILY_LIMIT')
assert.equal(purchaseAllowanceUsage(ledger,[],true,lagosReset).remainingUsd,0)
assert.equal(reserveCheckoutBuyer(ledger,{...input,order:order('two'),now:utcReset}).charges.length,2)
assert.equal(purchaseAllowanceUsage(ledger,[],true,utcReset).remainingUsd,7000)
const personal={id:'one',amount:100,usdUnits:50e6,level:'basic',now:before}
const transfers=reserveAllowance(undefined,personal)
assert.throws(()=>reserveAllowance(transfers,{...personal,id:'two',now:lagosReset}),e=>e.code==='KYC_ADVANCED_REQUIRED')
assert.equal(reserveAllowance(transfers,{...personal,id:'two',now:utcReset}).charges.length,2)
const legacy={charges:transfers.charges.map(c=>({...c,dayPolicy:undefined}))}
assert.throws(()=>reserveAllowance(legacy,{...personal,id:'two',now:lagosReset}),e=>e.code==='KYC_ADVANCED_REQUIRED')
console.log('PASS UTC midnight reset, no 23:00 refill, legacy overlap preservation, tagged records, shared purchase display and Personal enforcement.')
process.exit(0)

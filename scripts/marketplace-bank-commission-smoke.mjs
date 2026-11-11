import assert from 'node:assert/strict'
import {marketplaceBankCommission,assertMarketplaceBankCommission} from '../api/marketplace/bank-commission.ts'
for(const [principal,expected] of [[1000000n,3000n],[1000166n,3000n],[1000167n,3001n],[1000500n,3002n],[99999999999999999999999n,300000000000000000000n]])assert.equal(marketplaceBankCommission(principal),expected)
for(const percent of ['0.3','0.30','0.300000'])assert.doesNotThrow(()=>assertMarketplaceBankCommission(1000000n,3000n,percent))
for(const percent of [undefined,0.3,'0','0.31','3e-1','-0.3'])assert.throws(()=>assertMarketplaceBankCommission(1000000n,3000n,percent))
assert.throws(()=>assertMarketplaceBankCommission(1000000n,3001n,'0.3'))
console.log('PASS bank commission: integer precision, micro-unit rounding, exact approved percentage and amount; malformed or changed commission rejected.')

assert.equal(marketplaceBankCommission(1050000n),3150n)
for(const percent of ['',undefined,'0.3'])assert.doesNotThrow(()=>assertMarketplaceBankCommission(1050000n,3150n,percent,'fixed_units'))
for(const fee of [0n,3149n,3151n,3200n])assert.throws(()=>assertMarketplaceBankCommission(1050000n,fee,'','fixed_units'))
assert.throws(()=>marketplaceBankCommission(-1n))

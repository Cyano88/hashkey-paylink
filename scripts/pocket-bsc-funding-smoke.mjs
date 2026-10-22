import assert from 'node:assert/strict'
import {bscSwapGasPolicy, planBscSwapFunding} from '../src/pocket/lib/pocketBscFunding.ts'

const one = 10n ** 18n
for (const stable of ['USDC', 'USDT']) {
  const input = {tokenIn: stable, tokenOut: 'BNB', amountUnits: String(one), inputBalanceUnits: String(one), reimbursementUnits: '26736000000000000', nativeGasReserveUnits: '0'}
  const plan = planBscSwapFunding(input)
  assert.equal(plan.reimbursementAsset, stable)
  assert.equal(plan.tradeInputUnits, '973264000000000000')
  assert.equal(BigInt(plan.tradeInputUnits) + BigInt(plan.reimbursementUnits), one)
  assert.equal(plan.sufficient, true)
  assert.equal(planBscSwapFunding({...input, inputBalanceUnits: String(one - 1n)}).sufficient, false)
  for (const change of [{nativeGasReserveUnits: '1'}, {reimbursementUnits: '0'}, {reimbursementUnits: String(one)}, {reimbursementUnits: String(one + 1n)}]) {
    assert.throws(() => planBscSwapFunding({...input, ...change}))
  }
  const native = {...input, tokenIn: 'BNB', tokenOut: stable, reimbursementUnits: '0', nativeGasReserveUnits: '200000000000000', inputBalanceUnits: '1000200000000000000'}
  const nativePlan = planBscSwapFunding(native)
  assert.equal(nativePlan.reimbursementAsset, null)
  assert.equal(nativePlan.tradeInputUnits, String(one))
  assert.equal(nativePlan.sufficient, true)
  assert.equal(planBscSwapFunding({...native, inputBalanceUnits: '1000199999999999999'}).sufficient, false)
  assert.throws(() => planBscSwapFunding({...native, reimbursementUnits: '1'}))
  assert.throws(() => planBscSwapFunding({...native, nativeGasReserveUnits: '0'}))
  for (const field of ['amountUnits', 'inputBalanceUnits', 'reimbursementUnits', 'nativeGasReserveUnits']) {
    for (const value of ['-1', '1.2', '01', '1e18', ' ', String(2n ** 256n), 1]) assert.throws(() => planBscSwapFunding({...input, [field]: value}))
  }
  assert.throws(() => planBscSwapFunding({...native, amountUnits: String(2n ** 256n - 1n)}))
}
for (const pair of [['USDC', 'USDC'], ['BNB', 'BNB'], ['ETH', 'USDC'], ['__proto__', 'BNB']]) assert.throws(() => bscSwapGasPolicy(...pair))
console.log('PASS BSC input-stablecoin reimbursement, 18-decimal conservation, BNB gas reserve, balance boundaries and invalid policy/amount rejection; no signing or broadcast')

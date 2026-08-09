import assert from 'node:assert/strict'
import { selectPocketCheckoutRoute } from '../src/lib/pocketCheckoutRouting.ts'

const usdc = value => BigInt(value) * 1_000_000n
const balances = (base, arbitrum, solana) => [
  { network: 'base', units: usdc(base), available: true },
  { network: 'arbitrum', units: usdc(arbitrum), available: true },
  { network: 'solana', units: usdc(solana), available: true },
]

assert.deepEqual(selectPocketCheckoutRoute({ destination: 'base', amountUnits: usdc(6), balances: balances(7, 2, 5) }),
  { kind: 'direct', destination: 'base', amountUnits: usdc(6) })
assert.deepEqual(selectPocketCheckoutRoute({ destination: 'base', amountUnits: usdc(6), balances: balances(1, 2, 8) }),
  { kind: 'quote-required', source: 'solana', destination: 'base', amountUnits: usdc(6) })
assert.deepEqual(selectPocketCheckoutRoute({
  destination: 'base', amountUnits: usdc(6), balances: balances(1, 7, 8), bridgeTotals: { solana: usdc(9), arbitrum: usdc(6) },
}), { kind: 'bridge', source: 'arbitrum', destination: 'base', amountUnits: usdc(6), totalSourceUnits: usdc(6) })
assert.equal(selectPocketCheckoutRoute({ destination: 'base', amountUnits: usdc(6), balances: balances(1, 2, 3) }).kind, 'insufficient')
assert.deepEqual(selectPocketCheckoutRoute({ destination: 'arbitrum', amountUnits: usdc(6), balances: balances(6, 0, 6) }),
  { kind: 'quote-required', source: 'base', destination: 'arbitrum', amountUnits: usdc(6) })

console.log('Pocket checkout routing smoke tests passed.')

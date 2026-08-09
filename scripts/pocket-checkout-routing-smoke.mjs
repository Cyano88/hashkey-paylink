import assert from 'node:assert/strict'
import { selectPocketCheckoutRoute } from '../src/lib/pocketCheckoutRouting.ts'

const usdc = value => {
  const [whole, fraction = ''] = String(value).split('.')
  return (BigInt(whole) * 1_000_000n) + BigInt(`${fraction}000000`.slice(0, 6))
}
const balances = (base, arbitrum, solana) => [
  { network: 'base', units: usdc(base), available: true },
  { network: 'arbitrum', units: usdc(arbitrum), available: true },
  { network: 'solana', units: usdc(solana), available: true },
]

assert.deepEqual(selectPocketCheckoutRoute({ destination: 'base', amountUnits: usdc(6), balances: balances(7, 2, 5) }),
  { kind: 'direct', destination: 'base', amountUnits: usdc(6) })
assert.deepEqual(selectPocketCheckoutRoute({ destination: 'base', amountUnits: usdc(6), balances: balances(1, 2, 8) }),
  { kind: 'quote-required', source: 'solana', destination: 'base', amountUnits: usdc(5) })
assert.deepEqual(selectPocketCheckoutRoute({
  destination: 'base', amountUnits: usdc(6), balances: balances(1, 7, 8), bridgeTotals: { solana: usdc(9), arbitrum: usdc(6) },
}), { kind: 'bridge', source: 'arbitrum', destination: 'base', amountUnits: usdc(5), totalSourceUnits: usdc(6) })
assert.equal(selectPocketCheckoutRoute({ destination: 'base', amountUnits: usdc(6), balances: balances(1, 2, 3) }).kind, 'insufficient')
assert.deepEqual(selectPocketCheckoutRoute({ destination: 'arbitrum', amountUnits: usdc(6), balances: balances(6, 0, 6) }),
  { kind: 'quote-required', source: 'base', destination: 'arbitrum', amountUnits: usdc(6) })

// The validated fee-payer relay makes Solana eligible as one automatic bridge
// source. Existing destination USDC is retained, so only the shortfall moves.
assert.deepEqual(selectPocketCheckoutRoute({
  destination: 'base',
  amountUnits: usdc(2.5),
  balances: balances(1.3, 0.4, 1.5),
}), { kind: 'quote-required', source: 'solana', destination: 'base', amountUnits: usdc(1.2) })
assert.deepEqual(selectPocketCheckoutRoute({
  destination: 'base',
  amountUnits: usdc(2.5),
  balances: balances(1.3, 0.4, 1.5),
  bridgeTotals: { solana: usdc(1.263) },
}), { kind: 'bridge', source: 'solana', destination: 'base', amountUnits: usdc(1.2), totalSourceUnits: usdc(1.263) })
assert.equal(selectPocketCheckoutRoute({
  destination: 'base',
  amountUnits: usdc(2.5),
  balances: balances(1.3, 0.4, 1.5),
  bridgeTotals: { solana: usdc(1.501) },
}).kind, 'insufficient')
assert.deepEqual(selectPocketCheckoutRoute({ destination: 'solana', amountUnits: usdc(1), balances: balances(0, 0, 1.5) }),
  { kind: 'direct', destination: 'solana', amountUnits: usdc(1) })

console.log('Pocket checkout routing smoke tests passed.')

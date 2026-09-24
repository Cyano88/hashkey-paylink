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

for (const network of ['arc','ethereum','polygon','arbitrum','solana']) {
 const rows=[{network:'base',units:usdc(1),available:true},{network,units:usdc(100),available:true}];
 assert.equal(selectPocketCheckoutRoute({destination:'base',amountUnits:usdc(100),balances:rows}).source,network);
 assert.equal(selectPocketCheckoutRoute({destination:'base',amountUnits:usdc(100),balances:rows,bridgeTotals:{[network]:usdc(100.01)}}).kind,'insufficient');
 assert.equal(selectPocketCheckoutRoute({destination:'base',amountUnits:usdc(100),balances:rows,bridgeTotals:{[network]:usdc(99.1)}}).kind,'bridge');
 rows[1].available=false;
 assert.equal(selectPocketCheckoutRoute({destination:'base',amountUnits:usdc(100),balances:rows}).kind,'insufficient');
}
console.log('PASS: all five source networks cover Base shortfalls only when balances also cover quoted fees; unavailable balances cannot fund a payout.');

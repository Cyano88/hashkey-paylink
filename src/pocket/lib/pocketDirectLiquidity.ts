import { parseUnits } from 'viem'
import type { PocketBalanceSnapshot } from './pocketBalanceCache'
import type { PocketCheckoutNetwork, PocketCheckoutRoute } from '../../lib/pocketCheckoutRouting'

// Routing hint only. Circle still authorizes and executes the exact transfer;
// this must never approve payment or override a persisted bridge checkpoint.
export function cachedPocketDirectLiquidity(snapshot: PocketBalanceSnapshot | undefined, destination: PocketCheckoutNetwork, amountUnits: bigint, now = Date.now()) {
  const wallet = snapshot?.wallets[destination]
  const row = snapshot?.displayRows.find(row => row.key === destination)
  if (!wallet?.walletId || !wallet.address || !row?.known || row.stale || row.status !== 'ok' || !row.observedAt
    || now < row.observedAt || now - row.observedAt > 60_000 || amountUnits <= 0n || !Number.isFinite(row.balance) || row.balance < 0) return null
  // Floor to token precision: routing must never round an insufficient balance up.
  const available = parseUnits((Math.floor(row.balance * 1_000_000) / 1_000_000).toFixed(6), 6)
  return available >= amountUnits ? { route: {kind:'direct', destination, amountUnits} as PocketCheckoutRoute, wallets:snapshot!.wallets } : null
}

# Ethereum and Polygon wallet alignment — 2026-09-24

## Verified cause
The latest linked production account inspected read-only had matching active Base/Arbitrum/Arc wallets at a later creation slot, with Ethereum and Polygon at their first slot. All five active wallets use Circle single-owner v4. No addresses, balances, or credentials were copied into this report.

## Repair
- New-account initialization and creation batch all five EVM networks with an explicit v4 configuration.
- Existing additional-network setup checks the server-linked Base anchor and authenticated Circle inventory, uses deterministic creation keys, and bounds missing-slot creation to three attempts. It never accepts an inferred address: the returned provider address must actually match the current Base address.
- Existing funded wallets remain active. Separate, server-owned migration plans reuse Pocket PIN approval, durable reservations, fee review, exact native-USDC calldata, and finalized receipt checks.
- Empty-wallet activation checks fresh exact USDC balance, Circle ownership/inventory/pending activity and Pocket payment intents. It archives the old link, activates the new link and records completion atomically under the existing operation/link locks.
- Previous Ethereum/Polygon wallets remain recoverable for later USDC deposits. Other tokens remain in archived wallets and are not moved.
- Restored sessions accept a replacement only when the authenticated server link confirms its activation. Unactivated candidates remain blocked by link APIs.
- Home's update notice covers all five EVM addresses; funded additional updates use the existing Profile > Wallet update entry.

## Verification
Passed: bounded alignment, ownership/version/history guards, retry idempotency, funded-vs-empty behavior, native ETH/POL USDC calldata and exact finalized receipt checks; atomic activation/rollback/replay; original three-network migration activation, execution, provider, recovery, session and flow checks; six-network bootstrap and wallet-link adapters; preparation notices. Focused TypeScript diagnostics across changed files and migration consumers: zero. Web production build passed. Native build/install and live verification are recorded separately after completion.

No payment or migration transfer was signed or broadcast by the engineering checks. Live per-user alignment requires the retained authenticated Circle session or the normal user reconnect flow. Ambiguous creation history is stopped rather than generating unbounded wallets.

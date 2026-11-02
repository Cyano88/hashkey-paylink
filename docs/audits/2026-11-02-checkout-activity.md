# Checkout activity verification — 2026-11-02

Observed on Pixel: a verified Base merchant checkout appeared as an ordinary USDC send. The checkout was paid, but its execution had expired while confirmation was unavailable; the old execution-only activity adapter omitted it.

Changes:
- Read integrity-verified checkout records across standard EVM/Solana, BNB Chain and X Layer for payer and direct-recipient activity. Do not infer merchant identity from arbitrary transfers.
- Preserve merchant logo/name, order, actual network/asset, server receipt reference and settlement status. Paid records remain visible after session expiry; local payout stays pending until delivery.
- Canonical checkout rows supersede matching raw transfers and obsolete execution projections, preserving fees and unrelated batch transfers.
- Allow a CHECKOUT_EXPIRED execution to resume only after rereading verified paid checkout truth with matching owner, checkout, hash, amount and a confirmation inside the original payment window. Preserve ledger history.

Validation: checkout activity fixture across eight networks and two stablecoin labels; exact movement/direction and Solana address case; local payout gating; ownership; late-confirmation denial cases and ledger history; existing activity grouping/durability, payment execution and checkout receipt rail checks. Focused dependency TypeScript run reported existing errors outside changed files; no full-project typecheck claim.

No new payment was made. No native APK was rebuilt for this backend activity correction.

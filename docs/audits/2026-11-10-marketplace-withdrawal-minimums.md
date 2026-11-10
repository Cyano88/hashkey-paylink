# Marketplace withdrawal audit ? 10 November 2026

## Agreed product rules

Small orders credit the exact seller allocations and platform commission supplied by the marketplace. Verified funding credits pending balances; finality and an authorized release are required before payout. Available funds below a payout minimum stay available, not pending. Withdrawals are requested through the marketplace API; reaching a threshold never auto-submits a transaction.

Wallet: at least 0.50 USDC received on Base, with network fees additional. Bank: at least 1.00 USDC converted to NGN, with provider and network fees additional. These limits apply per recipient, including platform commission. They do not set purchase minimums or refund minimums. USDT remains outside the narrow USDC pilot.

## Verified architecture and gaps

- Exact split and conservation checks already exist in accounting.ts. Funding, release, reservations, successful payment, refunds and fees remain independently tracked.
- Seller balances aggregate across books, but wallet and bank payout reservations are payment/allocation scoped. An aggregated display is not an executable consolidated withdrawal.
- Allocation settlement and beneficiary snapshots are fixed at payment creation. Choosing a different bank or wallet at withdrawal time is not implemented.
- Seller IDs can occur in both seller and platform roles. New balance breakdowns keep role, beneficiary and settlement separate rather than presenting the aggregate alone as withdrawable.
- Marketplace bank infrastructure is internal; the current application creates wallet-only USDC plans. No new NGN route is activated by this change.

## Implemented first stage

Shared integer-unit minimum policy; net wallet quote checks; atomic minimum checks for new wallet and bank reservations; HTTP 400 minimum error with structured minimum and fee disclosure; balance account breakdown and quote-required eligibility; portal and docs explain the simplified lifecycle and current limitations.

Persisted quote validation and reconciliation intentionally retain historical smaller payouts. Existing idempotent reservations replay before the new minimum check. Refund validation is unchanged. No holding-wallet transfer, provider order or production activation was performed.

## Required next accounting stage

Consolidated withdrawals need a durable parent withdrawal with a fixed quote and explicit source allocations, restricted to one project, recipient role and asset. Reserve all source allocations atomically; retain source provenance for refunds. Prevent races with refunds, fee reserve funding and competing withdrawals. Reconcile one verified external outcome across every source exactly once. Unknown outcomes retain every reservation; definitive failure restores each source. Cancellation before submission must restore all sources atomically. A destination change requires current recipient ownership verification and explicit authorization; it must never rewrite historical allocation evidence.

Do not simulate accumulation by creating a synthetic funded order or by issuing multiple subminimum transfers. The bank and wallet execution adapters, workers, cancellation, backing audit, receipts and webhooks must understand the parent withdrawal before enabling it.

## Verification

Boundary tests cover one unit below and exactly at the net minimum, additional fees, invalid amounts, separate roles and projects, balances across small orders, and small refunds. Existing wallet and bank reservation tests cover concurrency, retry/restart, expiry, changed quotes and outcomes. Browser checks cover Marketplace docs at 320, 390 and 1280 pixels in light/dark modes. Fixture results do not prove a live payout.

Validation completed: withdrawal-policy, wallet-fees, bank-quotes, gas-quotes, HTTP, accounting, instructions, application, wallet-payouts, refunds, bank-fees and docs-browser smoke suites passed. Focused TypeScript diagnostics passed for 26 changed/relevant files. Mobile documentation screenshot reviewed; no horizontal overflow in six viewport/theme combinations. Not deployed in this stage.

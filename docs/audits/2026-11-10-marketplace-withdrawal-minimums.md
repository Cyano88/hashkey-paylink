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


## Stage 2: accumulated withdrawals

Implemented on the same day after the first-stage commit:

- A server-issued withdrawal quote selects up to 100 released source allocations for exactly one project, recipient, role and Base USDC asset. Seller and platform balances are not interchangeable.
- A withdrawal-time beneficiary must already be verified for that recipient. Current status and immutable destination binding are checked again before reservation and submission. Original allocation destinations remain unchanged.
- One parent payout uses the existing wallet execution, Circle recovery, worker, webhook and receipt flow. Child accounting operations reserve the exact contribution from each order. No synthetic funded order is introduced.
- Reservation is atomic. Submission marks every source unknown before I/O. Cancellation or definitive failure restores every source; a verified final outcome updates all sources once. Refunds cannot consume reserved sources. Child operations cannot be finalized through generic repository commands.
- Network fee allocation uses cumulative integer proportions, preserving exact fee totals even at one micro-unit precision. One payout emits one receipt/event, not a receipt per source.
- Custody checks every source's verified holding collection. Backing still counts each source obligation once.
- Private-pilot API: POST /api/marketplace/v1/withdrawal-quotes and POST /api/marketplace/v1/withdrawals. The quote returns the anchor payment ID used by existing cancellation, status and receipt routes. No rollout flags were changed.
- Bank reservations, execution coordination, verified reconciliation and receipts now support pooled sources and a different verified bank destination. Tests use provider and bank-ownership fixtures. A live bank ownership provider and the production bank quote/funding worker composition remain unavailable; the application explicitly rejects bank withdrawal quotes. An identity-source question was sent to the owner before implementing that dependent work.

Validation: all 41 non-browser Marketplace smoke suites passed (HTTP rerun passed after a Windows forced-exit shutdown error); targeted TypeScript diagnostics passed for 35 relevant files; production Vite build passed; docs browser checks passed at 320/390/1280 in light/dark. New accumulated wallet and bank fixtures cover role separation, competing reservation, refund exclusion, alternate verified destination, revocation, cancellation, restart/unknown outcomes, exact distributed fees, single-event reconciliation and receipts. These do not replace funded acceptance testing. No funds moved.

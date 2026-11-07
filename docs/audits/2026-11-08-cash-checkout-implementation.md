# Cash checkout implementation - 2026-11-08

## Scope

Cash balance is a standalone method for NGN-priced, NGN bank-settlement selection checkouts. It spends existing Base USDC, not an additional naira ledger. The merchant still receives NGN. Direct fixed-asset API checkouts retain their existing contract; the portal example now requests payment selection for NGN.

## Backend

- Resolve payer ownership and Base wallet from authenticated Privy/Circle linkage before provider preparation. Ignore client-supplied refund addresses.
- Sign the cash owner/address binding in parent and child records; public responses expose the method, not ownership data.
- Cash provider orders use that payer's Base wallet as refund destination. This is routing, not a claim that a refund has completed.
- Validate the bound wallet, Base, USDC at fee quoting/signing and transaction evidence ingestion.
- Keep the existing one-provider-order preparation/recovery lock. A prepared local order cannot be switched to another method or owner; retries recover the same child. Historical signatures remain compatible.
- Preserve existing fee/reimbursement, payout reconciliation, webhook and success rules.

## Checkout, portal and admin

- Cash balance alongside Stablecoins. Cash has no network selector; unsupported NGN asset routes are omitted from payer controls, while saved merchant preferences remain unchanged.
- Review retains NGN order price, exact USDC payment and FX. Low funds opens personal wallet top-up; it cannot bridge, convert or charge automatically.
- Native hosted checkout auto-funding is disabled. Its top-up uses the selected wallet/network/asset directly and returns to the mounted review.
- Developer quickstart requests selection for NGN and prices local orders in NGN; admin distinguishes payment methods, receiving currency and cash refund destination.
- Bank deposit availability is unchanged. USD/NGN virtual accounts are not enabled by this checkout change.

## Verification so far

Passed: web TypeScript; web source build; native source guard, source build and Android debug build; selection API smoke; cash ownership/refund/replay/tamper fixtures; hosted checkout adapter including signed cash metadata; merchant fee proofs; developer local-settlement fixtures; mobile/desktop selector browser tests.

Browser CLI review: separate Cash method; no cash network selector; original NGN price and exact debit; Base USDC personal top-up; returning to review after five balance refreshes did not call payment.

Live acceptance and the final native build are recorded below when complete. No funded cash payment or actual provider refund has been executed by these fixture checks.

## Live acceptance

- Production code: 1091e2b36ffb5f70edffcb247362e09acf30aded, Render deployment dep-dbnr64s9v7es73dhm3d0 verified live. Includes cash method metadata in authenticated status and signed webhook event payloads.
- Lunchroom parent chks_867c8bcb1b3a44de8d37a766 retained child chk_999320aa54544abab549 across web, native, restart and return.
- Live reviewed order: NGN 2053.13, exact debit 1.500004 USDC, quoted rate 1368.75 NGN/USDC. Existing cash 1.388963 USDC was insufficient.
- Server read verified signed child, parent/child owner and address equality, Base USDC, and provider refund_address matching the bound payer wallet. Provider order initiated; no payment recorded.
- Pixel exposed a stale automatic-funding wait after disabling route discovery. Fixed both discovery and waiting-state gates for hosted checkout in both source trees. Rebuilt and repeated: Add funds now opens a fixed Base USDC personal-wallet QR/address. Return to payment preserves the review; no bridge, conversion or payment was initiated.
- Cold-start checkout handoff and selected-child recovery were exercised without another provider order.
- Native cash review omits the merchant-net payout row: the payer sees order price, exact debit, cash balance and rate rather than a temporary gross fallback while bank details load.
- Final scope remains NGN-priced local bank checkout. Actual funded payment, merchant bank delivery, and provider refund execution have not been exercised in this acceptance run. No claim of live money-movement success is made.

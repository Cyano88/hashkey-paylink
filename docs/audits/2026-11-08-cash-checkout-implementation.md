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

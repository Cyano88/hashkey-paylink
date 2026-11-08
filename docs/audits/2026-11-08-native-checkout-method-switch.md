# Native checkout method switching — 2026-11-08

## Verified mismatches
- Cash selection locked the parent to cash before submission; a UI-only switch would fail.
- Native initial selection mixed cash/stablecoin tabs and displayed a loose preparation shimmer.
- Native confirmation used X as Back; initial X already only left the checkout, without an order-cancellation request.
- Stablecoin handoff omitted an explicit method. A reopened parent could follow an earlier cash selection.

## Changes
- Explicit method in app handoff; native parent lookup respects a valid merchant-enabled method. Missing method on an unselected parent fails with a return-to-checkout instruction instead of guessing.
- Same checkout method-list component used in native: Stablecoins, Cash balance, Card, Google Pay, Apple Pay, WalletConnect Pay and Bank transfer. Upcoming methods remain disabled and have no payment calls.
- Change payment method loads authenticated server-authoritative options within Pocket. Native Circle forms, BNB checkout card and X Layer payment form expose the action before submission.
- Cash step contains no token/network selectors. Stablecoins has accepted network and asset choices. Browsing the list does not mutate the order.
- Continue has an in-button spinner and is disabled while preparing. Confirmation opens only after preparation/readiness. Initial sheet has X only; confirmation has Back and X with distinct semantics. Android Back follows the explicit Back action where present.
- Parent route registry reuses the original cash child and cached stablecoin children. Cash account remains bound after leaving cash. Existing historical signatures remain readable. Old child signing is rejected after a switch; submission lock prevents switching.
- Unknown bank preparation remains reserved and retries recovery-only. No new provider order is issued after an ambiguous preparation timeout. Existing endpoints/authentication/fees/allowance remain in place.

## Checks
Passed: TypeScript; source bundles; native lineage guard; native methods browser test; web verification browser test; cash identity/signature test; method settlement round trips across eight networks, wrong-account rejection, ambiguous preparation recovery, cached cash reuse; route-switch races/old quote lockout/expiry; Circle-network recipient snapshot tests; handoff parser and method preservation.
Final bundles, deployment and Pixel observations are recorded below when completed. No payment has been sent.

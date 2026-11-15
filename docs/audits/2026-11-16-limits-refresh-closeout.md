# Limits, verification badges and home refresh — 2026-11-16

## Changes
- All daily allowance ledgers now use 00:00 UTC. New charges carry utc-v1; old Lagos buckets remain counted through their overlapping window to avoid a migration allowance refill. VTpass request IDs retain the provider-required Lagos date.
- Limits pages use concise maximum labels, aligned amounts and `Limits are subject to change.` Country selection, provider capacity and daily allowance remain separate.
- Basic and Advanced use the same green badge component, equal height and a shared right edge. Daily reset wording appears once.
- Home pull-to-refresh uses a Material-style blue arrow, elevated white circle and animated progress arc. Gesture thresholds, release-only refresh and cancellation behavior are unchanged; reduced motion is supported.
- Nigerian Advanced government-document selection includes NATIONAL_ID only when permitted by the account and present in Smile's legacy document catalogue. The actual V12 SDK explicitly loads that catalogue for legacy document codes. NIN_V2 remains a number verification code and is never substituted for a document.

## Evidence before release
- Changed-file TypeScript diagnostics passed (27 files); native diagnostics and Android debug build passed.
- UTC migration, checkout/QR/wallet allowance, personal usage, Bills store and KYC regression checks passed. KYC fixtures cover National ID document approval with identity matching and reject wrong document types.
- Limits browser checks cover seven categories, 320/390px widths, aligned badges, country shimmers and navigation.
- Refresh browser checks cover arrow-to-ring, reduced motion, short pull, retreat, cancellation, horizontal gestures and scroll-to-top.
- No real identity verification or payment was submitted for these checks. Production preflight, deployment and Pixel results are recorded below when completed.

# Marketplace Payments reuse audit - 9 November 2026

Scope: user's new Marketplace Payments integration. Preserve existing Checkout, Polymarket Funding, native Pocket lineage and retired PayStream boundary.

Findings:
1. api/hosted-checkouts.ts verifies a configured recipient and treats ordinary payment as settled; this cannot collect marketplace holdings unchanged. Local routes create/fund a payout before completion. Marketplace must introduce a verified holding destination before exposing collection.
2. api/pocket/xpay-bank-payout.ts and api/checkout-cash-policy.ts explicitly bind the local path to Base USDC. Reuse quote/funding/settlement logic after release. Do not route USDT through Cash balance or infer arbitrary seller-payout provider approval.
3. api/render-durable-store.ts supplies a transaction and row lock even for first writes, suitable for an initial atomic accounting repository. Reservation must precede external execution; unknown outcomes retain the reservation.
4. Developer identity, profile isolation, keys and webhook mechanisms are reusable, but marketplace scopes and beneficiary authorization are not implemented. Existing product permissions must not silently gain new money authority.
5. Arc agreement foundations and retired PayStream concepts cover release/refund concepts, not a production Base multi-seller escrow. The archive is reference only. No retired route is restored.
6. Seller balances should be project-scoped allocation views with separate USDC/USDT pending/available/reserved amounts. Personal Pocket Cash balance must not become the marketplace ledger.

Implementation is described in ../marketplace-payments-contract.md. This phase is an internal accounting foundation and disabled product/docs option. API exposure and financial execution remain closed.

Validation notes:
- First accounting fixture passed exact allocation sums, invalid precision/routes, funding-required release, project isolation, canonical retries, partial refund and failure restoration, uncertain payout reservation, no clawback of spent funds, atomic payout races, restart and asset separation.
- Focused diagnostics passed for the initial 13 changed/new TS files.
- Docs browser fixture passed 320/390/1280 widths in light/dark and real link navigation. The first fixture used MemoryRouter against ordinary anchor links; corrected to BrowserRouter and local routed pages.
- Existing browser fixtures depended on an absent generated CSS file and old Project/Create project wording. Updated to generate CSS and match current App/Create app labels; corrected the existing 'a app' grammar in the touched form.
- Existing project-adapter receipt assertions expected optional receipts and generated enabledAt. Current unchanged receipt normalization mandates enabled=true and ignores client-supplied history. Updated assertions to verify those existing guarantees.
- Final tests/build/visual results follow below.

## Final validation

- Marketplace accounting suite passed with exact sums, asset-route rejection, project isolation, command/draft idempotency, partial refunds, no spend of unknown payouts, conservation, concurrent reservations, restart and separate seller asset views. Durable repository behavior is exercised with a serialized fixture store; no production database or financial provider was mutated.
- Developer production access suite passed; project adapter suite passed including explicit 409 rejection of marketplace creation/configuration. Marketplace-only capabilities grant no production access.
- Product picker passed with two available options and the disabled Marketplace Payments option. Existing legacy settings are retained. App creation passed validation, keyboard controls, duplicate prevention, pending locks, error recovery, Back/Cancel and 320/390 layouts.
- Marketplace docs passed 320/390/1280 light/dark layouts, settlement-before-integration ordering, all three route descriptions, explicit unavailable status and link navigation. Mobile picker and docs screenshots were visually inspected.
- Focused diagnostics passed for all 14 changed/new TypeScript files; complete web source build passed in 1m02s. This does not claim a full-project tsc pass.
- Work is isolated on feat/marketplace-payments-foundation-20261109. No production deployment, native rebuild, funds movement or marketplace endpoint activation in this phase.

Next implementation boundary is verified holding/custody plus project-authorized collection/beneficiary/execution adapters; do not connect the internal synthetic-evidence transitions directly to HTTP bodies. The contract document lists the remaining activation requirements.

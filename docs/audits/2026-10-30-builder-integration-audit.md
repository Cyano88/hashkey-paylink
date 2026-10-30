# Builder integration audit - 2026-10-30

Scope: current one-time human stablecoin checkout integration, developer console and docs; verify examples, webhook contract, authenticated status/recovery and responsibilities. Prior funded checkout/receipt/email checks were reported complete by the user before this audit; this audit did not create another payment or send a message.

## Findings and fixes

1. Recovery was explained but lacked a copyable implementation. Added recoverOrderPayment to the server-only helper and a return-page/scheduled-worker example. It verifies authenticated status then calls the existing atomic order confirmation/queue adapter. Stable status:CHECKOUT_ID evidence is explicitly local recovery evidence, not a provider webhook. Builder storage must deduplicate by order ID across recovery and webhooks, use bounded batches/backoff, and never downgrade a paid order after uncertainty. Console links to the recovery section.
2. Helper now preserves HTTP status for unreadable/non-object API responses with a useful retry instruction. Checkout URLs reject credentials/query/fragment and retain canonical host/path/ID validation. Verified payment output includes parent/selected child identifiers for stored proof.
3. Clarified that acceptedAssets/acceptedNetworks validate order results and do not override the project's offered routes. API reference gives the current per-request validation ceiling without presenting it as a daily allowance.
4. Found funding QR asset coverage gap from the preceding release: X Layer checkout accepts USDe/USDG but funding QR only accepted USDC/USDT. Added both X Layer assets and rejection on other networks. Updated web Pocket token selection and USDG precision; native UI already supported them. Expanded actual QR decoding and both scanner tests for these assets.

## Verification

- Builder helper tests: exact create body/idempotency, canonical URL, signature tampering/staleness, parent-child matching, exact amount/asset/network, recovery adapter contract, no storage callback for pending/mismatch, transient response errors.
- Production webhook signer with copyable verifier: delayed original event with fresh retry signature accepted; body tampering/stale delivery rejected.
- checkout-selection-smoke: 17 configured options, immutable retry, signed state, concurrent selection binding, expiry/recovery, activation gates.
- hosted-stock-checkouts-smoke: all four supported X Layer stablecoins; exact precision, ownership, replay isolation, expiry and webhook retries.
- hosted-bsc-checkouts-smoke: both supported stablecoins and corresponding contract checks.
- hosted-checkouts-adapter-smoke: Circle/EVM/Solana routes, accepted asset restrictions, confirmed records after expiry, local-settlement fixture boundaries. Local fixture passes are not AML/provider approval.
- developer-projects-adapter-smoke and developer-payment-status-smoke passed. Optional PostgreSQL branch was not run because no disposable database was configured.
- Browser docs/console verification passed all 21 current pages, removed-route redirects, sample expansion, mobile navigation, 320/390/1280 widths and both themes, no page errors/overflow.
- Actual funding QR image decode and main/address scanner tests pass in web/native worktrees for USDT/USDe/USDG, with no payment requests.

Source: a0138d0110f35e7b227c1c65d47a9345cdbc3f82. Build, deployment and Pixel completion to follow.

## Remaining boundary

No new builder's own database adapter or fulfillment worker was deployed by this audit. Builders must supply those app-specific pieces and test their actual delivery action. Bank/mobile-money onboarding, AML policy, eligibility, approved daily limits, refunds/recovery policy and provider approval remain a separate next audit. Cards and recurring subscriptions are not enabled by this work.

## Build and Pixel completion

- Release Vite build completed in 2m 1s; native mobile build completed in 2m 6s. Existing large-chunk warnings remain.
- Capacitor sync and Android assembleDebug succeeded. Installed on Pixel 5A160DLCH006VM, preserving app data.
- Installed APK SHA256: a2e67ad79b8350b6e0bde9548d5909d080a24a2857120900b7b2b7add4327e9d.
- Pixel Playwright checks passed Base USDC, BNB USDT, X Layer USDT/USDe/USDG: exact recipient, network and asset populated; Continue disabled with no amount. These are scanner-payload route checks, not physical-camera scans or funded transactions. Browser tests separately decode actual QR frames.
- Initial full-page CDP navigation replayed the native launch URL; corrected the test to use in-app history navigation and verified all five cases. No product edit was made for this test setup issue.
- Pixel screenshot inspected: native worktree output/playwright/builder-funding-final.png.
- Source pushed to origin. Render deployment dep-dbi773ijnfac73d102pg started for a0138d0110f35e7b227c1c65d47a9345cdbc3f82; live verification pending.

## Live browser checks and known limits

- Main source deployment a0138d011 became live at 2026-10-30T10:43:48Z. A temporary 502 during the switch cleared after reload.
- Chrome Playwright verified the live recovery guide and the developer console's server recovery helper link to /docs/getting-started#confirm.
- Corrected one replacement character in the recovery code heading in d7105f85d484ed13ca55383a8875ccf9a09faac0. All 21-page responsive browser checks passed again. Deployment dep-dbi78tma5vhs73a0uf1g pending final live confirmation.
- Live console has browser-extension unload-policy errors and existing Privy warnings about Solana external connectors and unsupported Coinbase Smart Wallet chains. No new signing/provider test was performed here; these warnings are not reported as fixed.

## Final deployment completion

- Final source d7105f85d484ed13ca55383a8875ccf9a09faac0 is live; Render dep-dbi78tma5vhs73a0uf1g updated at 2026-10-30T10:48:25Z.
- Post-switch Chrome reload verified the corrected server-recovery heading and no horizontal overflow. The temporary switch-time 502 cleared; final page loaded successfully.
- This closes the scoped developer integration documentation/helper and funding-asset audit. It does not replace a builder's own end-to-end fulfillment test, the optional PostgreSQL branch, or the bank/AML/provider work listed above.

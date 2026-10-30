# Sandbox onboarding and production access - 2026-10-30

## Product boundary

- New dashboard visits without a deep link start in simulated Sandbox. Desktop environment switch is at the bottom left; mobile places it under navigation.
- Sandbox storage is `hashpaylink:developer-sandbox:v1:<owner hash>`, separate from projects, live payments, receipts, providers and activity. Keys are isolated and revocable. Existing live-route test-key rejection is unchanged.
- Simulator endpoint: `/api/developer-projects?resource=sandbox`. Supports creation, idempotent retries, status lookup, pending/processing/paid/failed/expired outcomes and signed webhook fixtures across the 17 currently accepted checkout asset/network combinations.
- This is NOT production API parity or a funded testnet. No hosted payment page, wallet/signing, fiat/provider compliance simulation, settlement, email receipt, outbound webhook delivery or funding-product execution. These limitations appear in the dashboard and integration guide.
- Signup itself needs no merchant KYC/KYB to access the simulator. A production app records Individual or Registered business; pre-existing apps default to business. Configuration requests cannot change account type or set personal-KYC approval.
- Ordinary human wallet checkout can issue production keys after routing setup, before KYB. Fees are unchanged. Restricted products retain verification requirements; resolved API policies filter capabilities rather than granting the whole selected product list.
- Suspensions, closed apps, rejected/reopened reviews, and previously reviewed applications awaiting new approval remain blocked. This avoids restoring access merely by resubmitting a previously approved application.
- Local fiat: businesses need approved KYB before bank verification/setup and key eligibility; individuals use existing Pocket personal KYC with the same owner. Personal KYC is checked at setup, key creation and immediately before preparing a provider order. Existing Uganda corridor requirements remain in force.
- No Paycrest on-ramp was enabled. Merchant KYB is not payer KYC. No new AML policy, daily allowance or provider approval is claimed.

## Verification

- `developer-sandbox-simulation-smoke.mjs`: owner isolation, key rejection/revocation, idempotency conflict/replay, terminal-state safety, all 17 asset/network combinations, signatures and capability gates.
- `developer-production-access-smoke.mjs`: individual KYC, business KYB, immutable account type, forged client approval rejection and no bank verification call before eligibility.
- Existing sandbox live-boundary suite, project adapter suite and encrypted business-verification/reviewer suite passed.
- Playwright sandbox test uses the real sandbox handler with isolated in-memory storage; covers create/pay/fixture/key/revoke, switch state, cleared secrets and retained test data, 320/390/768/1440 light/dark layouts. Screenshots under `output/playwright/sandbox-*` inspected.
- Existing business-verification browser suite passed; wallet-key expectation intentionally updated to the new product policy.
- Production frontend build passed. Final typecheck and release status recorded below when complete.

## Not yet verified

- A signed-in production-host sandbox persistence check and a newly onboarded production app have not been exercised against the deployed service.
- No live money, customer notifications, KYC submission or provider requests were made for these checks.
- Provider/AML decisions and existing settlement-recovery backlog remain separate in the preceding bank-compliance audit; simulator success is not evidence of resolution.

## Final local checks

- Final production build: exit 0.
- Full TypeScript check: exit 1 with 43 diagnostics, exactly matching the previous `billing-typecheck.log`; no added diagnostics and none in the changed files. This is an existing repository check failure, not a clean full typecheck.
- Production project adapter, verification state/reviewer checks, production KYC/KYB access tests, simulation isolation tests, live-route boundary tests and both Playwright suites passed.

## Release and live verification

- Source commit `ae4910ec97995615ab6adbaeeb1858e6c83c3e61`; Render deployment `dep-dbia8amtlv9c739a0oa0` live at 2026-10-30 14:11:28 UTC.
- Public capabilities HTTP 200 advertises isolated simulation, sandbox keys and signed fixtures, with funded execution and outbound webhook delivery explicitly false.
- Authenticated deployed dashboard: created `test_chk_02e75ca287364bfd94d027090b8ea4fd`, labelled `Sandbox release check - no funds`, 1.50 simulated USDT on X Layer. Simulated paid, reloaded the page, and observed the same ID and paid state from durable storage. No real funds or receipt notifications.
- Environment switch handler verified on deployed page and returned to sandbox with the paid fixture intact. The connected Chrome automation had pointer stability/key-dispatch issues; DOM button activation verified the handler. Local Playwright pointer tests passed. Extension unload-policy errors and existing Privy configuration warnings were observed separately from application results.
- Live health HTTP 200: database true; pocket healthy false; unresolved/stale 37 (24 hosted checkout, 12 bank payout, 1 POS settlement), unchanged from the preceding bank-compliance audit. This release is not an all-system health claim.
- The earlier unverified sandbox-persistence item above is now resolved. A new production merchant onboarding and real funded settlement remain untested in this release.

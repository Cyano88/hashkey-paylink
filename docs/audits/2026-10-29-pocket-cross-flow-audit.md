# Pocket cross-flow audit — 2026-10-29

Status: NOT READY for an all-clear. Live failures were reproduced; fixtures do not establish provider health or settlement success.

## Scope and build identity

- Pixel 10 Pro, existing Pocket 1.0.4 / versionCode 5, installed October 27. Tested through Playwright CDP and inspected an ADB screen capture.
- Native source: C:\Users\USER\hashpaylink-solana-bridge-release. This workspace has extensive pre-existing changes; no wholesale replacements or commits were made.
- Web/server release: C:\Users\USER\hashpaylink-exchange-push-release. Hosted checkout commits 3643c39d3 and 7392a0470 are live; the real hosted loading-gate check observed no old Pocket modal.
- No PIN entered, signatures approved, transfers submitted, requests sent to another person, app data cleared, or APK installed during this audit.

## Live matrix

| Flow | Verified | Open issue / limit |
| --- | --- | --- |
| Send | Existing X Layer USDT review, wallet/asset/network/amount/OKB fee; PIN cancellation reproduced | Raw Privy session timeout; cancellation became Failed; reimbursement missing in native build |
| Receive | USDC network list, X Layer address, balance and network-only warning; native screen accessible | BNB supported here but absent from Send/Request; narrow-screen fixture still fails Copy address viewport check |
| Bridge | Base to Arbitrum 0.1 USDC keypad entry and quote retry; actual Pixel layout | Both attempts failed: Network fee pricing is temporarily unavailable. No approval reached |
| Swap | Base percentage entry, eight-network picker, selection resets prior amount; X Layer USDC to OKB quote/retry | Base tiny ETH amount reports Insufficient funds; X Layer 1 USDC reports Price temporarily unavailable; no approval reached |
| Request | Pocket ID/Link toggles, asset/network controls, empty-form disabled action | USDC networks exclude BNB; no real request published or notified; settlement not tested |
| Bank pay | Saved recipient verification; amount entry; insufficient-cash guard at NGN 1,000 | NGN 100 quote reproducibly returns HTTP 400 /api/pocket/bank-withdraw: Failed to validate payload. Exact upstream field remains unresolved |

Evidence snapshots are under .playwright-cli (UTC October 28 22:56–23:23). Actual device screenshot: output/playwright/pixel-bridge-audit.png. Bank response observation retained only path, HTTP status and error; the temporary fetch wrapper was removed.

## Findings and local corrections

1. X Layer native reimbursement mismatch: backend sponsorship and VITE transfer switch are true, and the observed Pixel wallet is already allowlisted. scripts/build-pocket-mobile.mjs omitted the switch. Added public xlayer.transferSponsorshipEnabled requiring BOTH existing switches, and native build mapping in both worktrees. Authorization remains server-side. Not deployed or installed.
2. Proven pre-submission PIN cancellation incorrectly produced Failed. Added a marker only around the approval promise in usePocketStockWallet.send; the stock send UI returns to review only for that proven cancellation. Unknown/submitted outcomes stay pending. Focused regression passed.
3. Raw session transport exception leaked into payment approval. Added readPocketAccessToken and stable usePocketIdentity wrapper, translating timeout/network failures to a connection/retry message. No automatic payment replay or mutation retry. This improves presentation; it does NOT repair Privy's availability. Focused regression passed.
4. Live bridge fee pricing fails at api/payment-network-fees.ts (CoinGecko response failure). It correctly refuses to invent a fee, but the operation is unavailable. Provider response/status and a fresh-price recovery path need diagnosis.
5. X Layer swap quote/retry fails through pocketStockSwapClient. Need sanitized server/provider error to distinguish quote transport, pricing and sponsorship failure. Do not classify it as the same root cause as the bridge without evidence.
6. Bank payload failure is unresolved. Paycrest v2 schema was checked against https://docs.paycrest.io/openapi-v2.yaml; the local payload uses amountIn=fiat and explicit sender fee. Public rate lookup for 0.073 USDC reports no provider, which is a different error and does not prove why the order payload was rejected. Obtain the exact upstream validation details before changing payout fields or claiming a minimum-amount fix.
7. Coverage is unequal: Receive and Swap expose BNB Chain; Send and Request do not. Adding it requires execution/request support and tests, not just adding a selector option.
8. Receive layout at 320x640 fails the fixture's Copy address within viewport assertion. Confirm real scroll reachability/compact layout before calling mobile layouts complete.

## Regression evidence

Passed current checks:
- Native send API and USDT send
- Send truth/outcome and preparation
- Stock send pending/recovery plus new cancellation versus unknown/submitted scenarios
- Multi-request protocol and browser (eight fixture assets, ID and link, valid networks, reset)
- Request cancellation and private link authorization/idempotency/concurrent-claim handling
- Bank receive adapter; preparation error, quote scope and identity boundary browser checks
- Bridge draft lifecycle at 320/426, amount constraints, ownership/domain/mint proof
- Swap cancellation matrix: Base, Arbitrum, Ethereum, Polygon, Solana, BNB; signed/unknown recovery preserved
- BNB deposit identity/precision/finality, USDT deposit binding
- Send attempt recovery; exchange receipt parity; bank receipt identity parity
- Payment security; X Layer reimbursement batch/treasury/total/expiry binding
- New access-token and native sponsorship configuration checks
- Production Vite build into .codex-temp/audit-build: PASS (2m14s), ordinary vendor/chunk warnings
- Scoped TypeScript check for access-token helper and public config: PASS

Not green / not counted as passes:
- Old unified-send browser fixture has obsolete mocks/dependencies and labels.
- Native deposit fixture: updated obsolete BNB absence/network ordering assumptions; remaining Copy address viewport failure.
- Swap stale-selection fixture: Continue remains disabled; investigate fixture versus current behavior.
- Combined public-runtime-config suite fails its unrelated StreamGate recovery-order source assertion. New sponsorship config has its own passing behavior test.
- X Layer send layout fixture had obsolete keypad/recipient/retry selectors; final rerun status recorded below.

Browser fixtures use the already installed Playwright module via PLAYWRIGHT_MODULE / a temporary resolver. Initial missing-module runs are harness failures, not application failures. Some imported provider modules held connections open after assertions; completed suites were run with a wrapper that exits only after their awaited module finishes. Duplicate log-writer attempts were not counted as successful tests.

## Continuation order

1. Resolve bank upstream validation, bridge fresh fee pricing, and X Layer swap quote failure with exact sanitized provider evidence.
2. Resolve/explicitly define BNB Send/Request support and narrow receive layout; finish stale fixtures.
3. Port only verified minimal native corrections into the release worktree, preserving newer native swap/bridge work and live hosted checkout fixes. Native hosted checkout source is older than the shipped web page; avoid a broad rebuild/release that regresses it.
4. Publish public config, rebuild/sync/install APK preserving data, then repeat actual Pixel send fee review and PIN cancel checks. Current local corrections are NOT on the installed Pixel.
5. Only then do user-approved funded settlement tests, including pending/relaunch/history/receipt verification. Do not mark all flows aligned based on fixtures alone.

Final X Layer layout rerun: FAIL at keypad activation on a later viewport case (after updating obsolete selectors). Not counted as a pass; investigate focus/scroll/keyboard visibility with the real send component.

## Continuation verified 2026-10-29 04:54 UTC

Supersedes earlier provisional failure statuses above:
- Deployed backend/config/parser commit 35ab88c63, then fee-pricing/authentication/guard-message commit 9bf6abe3a. Render dep-dbhd071srm7s73fgh7f0 reported live at 04:53:28 UTC; public-config HTTP 200 verified. Deployment temporarily returned 502, affecting bank lookup and exchange availability during 04:51-04:53; do not attribute those samples to Paycrest.
- Native build and Gradle assembleDebug passed. Installed APK preserving data on Pixel 5A160DLCH006VM. New WebView PID15332. Verified onscreen amount keypad remains open and accepts 2 USDT. The 2 USDT X Layer send now reaches sponsorship preparation instead of the old direct OKB-fee route; it is blocked by the existing billing pause. No approval or broadcast.
- Bank upstream exact error: singleton data object, field Rate, no provider for USDC-to-NGN conversion of approximately 0.072212 USDC on Base for the 100 NGN test. Fixed parser accepting singleton and array detail shapes, enabling existing amount-unavailable message. No invented minimum amount, no payout-field/schema workaround. Boundary and bank-adapter checks passed.
- X Layer swap diagnostics identify billing_coverage, not OKX liquidity. Read-only production query confirms persistent halt: billedUsdMicros 248512 versus coverageUsdMicros 208704 (difference 39808 micros). Combined billing mode enabled. Halt retained; no guard bypass or treasury movement. Guard's fixed user-facing messages now carry HTTP503 so clients receive the reason. Canonical-receipt/coverage/depeg/combined-billing tests passed. Historical fee reconciliation remains required before resume.
- Bridge fresh-price recovery: CoinGecko failure can now fall back to authenticated OKX price data, requiring exact token/network identities, positive prices and fresh timestamps for BOTH gas and stablecoin. No stale or fixed-dollar fallback. Tests passed stale/future/zero/duplicate/missing/wrong-chain cases, stablecoin depeg ratio and cache expiry. Read-only live provider checks passed ETH/POL/SOL plus USDC. Production web build passed in 2m10s. Live Pixel bridge quote verification pending below.
- Send pre-submission cancellation marker and readable session transport failures are in installed native app and release source. Unknown/submitted outcomes retain pending recovery; no automatic send replay. Focused real-component and auth regressions passed.
- Keypad focus/pointer layout-shift correction is native-only (release does not contain that hook). Narrow/Pixel/landscape light-dark X Layer send suite and dedicated shifted-click/outside/Escape suite passed.
- Receive viewport test failure was fixture geometry/scroll setup, not a proven app defect. Corrected BNB/network-order expectations and scrollable shell. Narrow/Pixel light-dark deposit suite passed; no product Receive code changed.
- Swap stale-selection suite now passes Base, Arc, X Layer, BNB, Arbitrum, Solana, Polygon and Ethereum. Old fixture wrongly expected Close to preserve draft; current cancellation intentionally clears it. Expiry refresh happens once and never signs.
- Old pocket-unified-send-browser-smoke still fails to bundle obsolete mocks (Node crypto/stream imports); not counted as a pass or product failure. Current send-sheet/cancellation and X Layer send-browser suites cover current components. Combined runtime-config StreamGate source assertion remains unrelated and not green.
- BNB Send/Request capability parity remains a product gap. No unsupported selector was added. Funded settlement, final receipt/history/relaunch and real PIN approval were not executed.

## Final live checks after deployment

- Deployment 9bf6abe3af677037c2af60b8fe4e1eee12e4697a confirmed live. API recovered HTTP200.
- Reload reproduced Privy POST /api/v1/sessions timeout and startup reconnect overlay. One clean force-stop/reopen preserving data recovered authenticated home. This is NOT a permanent auth availability fix. New WebView PID16910.
- Pixel Base to Arbitrum 0.1 USDC quote now succeeds: fee 0.085677 USDC, total 0.185677 USDC, review reached without approval/broadcast. Screenshot output/playwright/pixel-bridge-fixed.png visually inspected; fee, total and controls fit on screen. Expiry correctly changes action back to Continue.
- Saved bank recipient lookup succeeds after API recovery. 100 NGN unfunded preparation now returns HTTP503 with "Bank payout is temporarily unavailable. Your money has not moved." No raw payload error. Important correction: ng-pos.ts intentionally maps Paycrest amount-unavailable errors to this generic provider-availability message before Pocket's narrower Naira-message handler sees it. The narrower handler's fixture passes but is not the live wording. Actual payout availability remains blocked for this amount; no payout was sent.
- Startup fixture initially failed because its installed clock kept advancing during browser setup. Pausing clock before rendering makes 15/30/60-second assertions deterministic; complete startup/offline/no-restart-after-ready suite passes. No startup product code changed.
- Native transport browser suite passes POST/auth/query preservation, bounded read retry, no execution replay, coalesced reads and abort isolation.

Remaining acceptance gates: recurring Privy session refresh timeout; X Layer billing-halt reconciliation; provider availability for bank amount; BNB Send/Request capability parity; obsolete unified-send fixture; unrelated combined-config StreamGate assertion; real funded end-to-end settlement/recovery/receipt testing. No overall all-clear issued.

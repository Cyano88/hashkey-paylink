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

## User-reported X Layer fee screen / BNB regression follow-up (06:22 UTC)

- Inspected user's actual 2 USDT X Layer confirmation screen: no fee row and enabled Confirm send despite failed sponsorship quote. Root: absent review removed all fee rows; button actually retried prepare but was misleadingly labelled as confirmation.
- Corrected both sources to reuse Base PocketAmountShimmer for Fee and Total while preparing, with existing CTA loading shimmer. No visible Calculating or Getting fee text. Failed preparation shows Fee Unavailable and Retry fee quote; successful reimbursement uses actual asset decimals for fee/total. Submission still requires a valid reviewed quote.
- User explicitly reaffirmed shimmer convention; the earlier calculating-text patch was superseded. Web deployment dep-dbhe968n74is73d5dgfg for 3af1bd9d1 was cancelled. Replacement commit ce5b4931b is deploying under dep-dbheahe1egvs73fbckng.
- Native production build, Gradle build and install preserving data passed. Pixel PID28089. Pixel/narrow/landscape light-dark actual component tests pass fee+total shimmer presence, no calculating text, explicit quote retry without send, and reset. Release real-component cancellation and quote-error tests pass.
- Verified BNB Chain is actually present in Pixel Swap and Bridge source selectors; BNB Swap opens, displaying BNB input. Native BNB Bridge capability lookup had a swallowed one-shot failure. Added five-second retry with cleanup and stable access-token dependency, matching existing X Layer recovery. Actual page fixture confirms BNB reappears after transient failure without navigation or any signing/submission.
- BNB Send remains absent from current native and release send routes. Tracked history and the dedicated BSC release checkout did not recover an earlier BNB Send implementation. Do not claim it was never working; exact prior implementation remains unverified.
- Found material source divergence: native PocketSwapPage includes BNB panels, web release PocketSwapPage does not. Full native page dependency comparison spans many shared components; did not overwrite them wholesale into release. Native BNB selectors are not missing because of shared PocketSelect: the b514ffbf9 BNB selector correction is already present in native source.
- Important rollout accountability: prior rebuild enabled configured X Layer stablecoin reimbursement while its persistent billing halt was active, replacing the old direct-OKB send path with a blocked quote. No rollback to silently charging OKB and no bypass of sponsorship pause performed.
- Isolated read-only re-evaluation of current combined billing could not complete due to BSC RPC connection unavailable. Stored halt unchanged; no funds or fee records modified.

Installed Pixel verification (final shimmer build): feeShimmer=1, totalShimmer=1, calculatingText=0 observed during the actual 2 USDT quote request. No payment approval. First retry coincided with web deployment restart (HTTP502), so its generic connection error is not new evidence of the billing guard's state. Final deployment health and same-screen BNB recovery checked separately below.

Final: ce5b4931b deployment confirmed live; public-config HTTP200. Actual Pixel same-screen BNB recovery during deployment: before=0 BNB options, after=1, reopenedScreen=false. The corrected retry restored the option in the already-open Bridge source selector. BNB Send and full native/web feature reconciliation remain open; sponsorship pause unchanged.


## Verification continuation 2026-10-29 06:44 UTC

- Reconnected actual Pixel PID28089 after foregrounding Pocket. Fresh Playwright snapshot confirms BNB Chain in Bridge source options with displayed 2.05 USDC. Quote-only BNB-to-Base 0.1 USDC reached review: received 0.078862 USDC, displayed Fee 0.0526395 USDC, Total 0.131502 USDC. Closed without approval or broadcast.
- Found a separate billing price clock defect: guard captured now before potentially slow supplemental BSC coverage checks. A newly fetched X Layer price could then exceed the old clock by over five seconds. Local correction checks price freshness against current dependency clock. Regression covers six-second supplemental delay, 30-second stale cutoff, and future-dated rejection; full guard suite passes. This correction is local, not deployed.
- Two read-only production reconciliation attempts did not complete. Second records Privy gas-spend HTTP520. No current coverage all-clear; earlier isolated success is insufficient to clear a persistent halt. No production records or halt modified.
- BNB stablecoin Send backend work is local and unwired: exact recipient plus treasury atomic batch, shared BSC sponsored gas pricing, sealed quotes, owner and PIN binding, durable submission/recovery, canonical settlement. New core and HTTP service fixtures pass USDC/USDT, 18-decimal amounts, wrong-chain/reorg/evidence rejection, cancelled/duplicate/timeout/restart behavior, quote tamper/owner/PIN checks, disabled capability reporting and invalid amounts. No live BNB Send claim: UI, endpoint/scheduler/activity/combined coverage wiring, build, deployment and live quote verification remain outstanding. No native BNB-token Send claim.
- Overall audit remains incomplete. Do not infer Receive, Request, bank payout, signing, or final settlement health from a successful bridge quote.

## BNB Send implementation and billing reconciliation 2026-10-29

- Backend/web commit c6d0aea4c deployed live as dep-dbhf1ce7bikc73efepe0. Added BNB Chain USDC/USDT Send using existing sponsored batch gas estimation and same-asset reimbursement pricing. Recipient transfer plus treasury reimbursement are atomic; quantities remain exact at 18 decimals. New authenticated endpoint, serialized durable operations, status-only recovery, reconciliation worker, immutable activity evidence and canonical reimbursement coverage are wired. Native BNB-token Send is not claimed.
- Backend, HTTP, canonical receipt/coverage, client cancellation/tampering/owner/timeout recovery, journal race, and billing guard regressions passed. Scoped frontend/backend TypeScript checks passed. Real-component BNB Send browser tests passed Pixel, narrow, landscape, light/dark; existing X Layer Send, native Receive and keypad regressions passed. No production send approved or broadcast.
- Fixed X Layer price validation against a stale pre-BSC-check timestamp. Current clock is now used for price freshness while retaining stale/future validation.
- Read-only billing checks first returned Privy HTTP520, then HTTP200. Successful canonical checks showed billedUsdMicros 248512 and coverageUsdMicros 568245. Final atomic reconciliation rechecked current coverage as 568754, archived the exact old halt under pocket:xlayer-billing-reconciliation:1793166065925, and removed only that matching old halt in a serializable transaction. Billing guard remains active. No treasury transfer or fee record modification.
- Actual Pixel BNB Send 1 USDC quote succeeded; initial raw fee 0.027017076618794529 exposed incorrect display precision. User corrected this. Accepted formatter verified in pocketMoney.ts: stablecoin display is two decimals, nonzero values below 0.01 show <0.01. Display commit b9a103f24 deployed live; Pixel verified Available 2.05 USDC, heading 1.00 USDC, Fee 0.03 USDC, Total 1.03 USDC. Exact quote and transaction values unchanged.
- Actual Pixel X Layer 2 USDT review now succeeds after reconciliation: Fee 0.01 USDT, Total 2.01 USDT. No PIN/confirmation. Its heading still showed 2 USDT; correction 79037fbe2 makes the stablecoin review heading 2.00 consistently.
- Deployment restart exposed HTML-error JSON parsing text in the new BNB UI. Correction 2e548b2ce maps non-JSON/transport failure to a normal retry message. Browser regression now supplies an HTML503 response, verifies no raw parser details, fee retry without signing, and successful recovery.
- Latest combined web commit 79037fbe2 deployment dep-dbhfk29rl4tc739fhhvg queued behind transport correction. Final native rebuild pending verification/install below. Last installed Pixel PID6051 includes display fix b9a103f24; do not confuse with later final build.
- Pixel startup logged safe-area CSS injection before a document element existed twice on one launch; app did reach authenticated home. This is a remaining startup observation, not proof that prior flicker or Privy availability problems are permanently fixed. Bank amount/provider availability and funded end-to-end settlement remain outside these quote-only passes.

## Final continuation checkpoint 2026-10-29 08:04 UTC

- Final web source 751581bc0080adfbbcb77e5a2990d45f75504642 deployed live as dep-dbhfpep42hec73cbpp2g. Public-config HTTP200 verified. Includes exact-value BNB Send, canonical shared coverage, display formatting, non-JSON response handling, X Layer stablecoin heading formatting, and visible CTA labels.
- User explicitly rejected CTA shimmers. Removed them from the new BNB buttons and web shared PocketSlideAction; native shared action already kept its text. Buttons remain disabled while preparing, and fee/total values retain shimmers. Browser regression verifies a labelled disabled CTA while value shimmers are visible, no Preparing transfer shimmer, HTML outage handling, ready quote transition and cancellation without signing.
- Final native build exited0, Gradle assembleDebug succeeded, and APK installed with adb install -r (data preserved). Final installation was background-only because user had opened a reference screen in another app. APK SHA256: c87e20db29445fde10d298a4ca7d735e8f3eea068508c1c366de856e924b5266. No claim of a new foreground live test after this last CTA-only installation. BNB page source matches release exactly.
- Verified Pixel before that CTA-only update: BNB USDC review showed 2.05 available, 1.00 heading, 0.03 fee, 1.03 total; X Layer 2 USDT quote showed 0.01 fee and 2.01 total. Earlier X Layer heading 2 USDT led to 79037fbe2 correction; latest build includes2.00 formatting. No PIN or transfer approval/broadcast performed.
- Additional live BNB USDT check attempted1 USDT with0.26 displayed available; quote returned BSC connection temporarily unavailable and showed Retry fee quote, no confirmation. Do not count as successful USDT live quote or assume underlying cause; gas simulation/insufficient principal should be investigated using a funded-within-balance quote. Fixtures for both assets passed.
- User showed a reference amount-entry screen and asked about amount-first layout, typing addresses and CTA location. Recommendation corrected: keep asset/network/recipient context, editable recipient with normal keyboard/Paste/QR, amount with Pocket keypad, and Continue above whichever keyboard is open (bottom when closed). Below-keypad suggestion withdrawn as inconsistent. No amount-first redesign or larger-input change was implemented during this discussion.
- Wider audit still has open bank provider/amount availability, intermittent Privy refresh, observed native safe-area startup warning/flicker investigation, web/native Swap feature divergence, request capability parity and funded settlement/relaunch/receipt testing. This checkpoint is not an all-flows all-clear.


## Provider recovery and local limits follow-up 2026-10-29

- Privy chunk8700 failed during native OKB-to-USDT approval; exact URL returnedHTTP200 from workstation, not proof of Pixel transport health. New chunk presentation preserves pending flags; old narrow submission-certainty classifier unchanged. Native review exposes Reload Pocket inside sheet. Tests prove unknown sends stay pending/locked and sign-only failures do not broadcast. Session/chunk provider availability remains open.
- Live Paycrest NGN/UGX checks rejected0.499999USDC and accepted0.5USDC. Rates1374.32NGN/4332.55UGX imply NGN687.16/UGX2166.28 upward-rounded minima before fees. Backend now verifies both boundary quotes before showing a local minimum, with no fixed FX value or automatic amount increase. Outages remain availability failures. Quotes do not prove payout delivery.
- Live bills minima: NG airtime Airtel50,MTN10,Glo10,9mobile5NGN; sampled Uganda flexible airtime50UGX. Electricity catalog minima vary100-2000NGN and meter-specific minima may be higher. Provider bounds now survive catalog serialization; NG airtime fetches catalog, UG airtime fetches flexible-product limits. UI validates provider/meter intersections and filters suggested amounts; backend revalidates. TV/data retain fixed catalog prices.
- Stocks Send balance/review/result now use accepted two-decimal formatting, including<0.01 dust. OKB retains its existing formatter. Stock-only Max uses exact balance and is disabled for stale/failed balances or pending transfers. Stock gas is sponsored or separateOKB. Native browser test verifies1weiNVDAx displays<0.01 but Max/quote retain0.000000000000000001; no send. Shared amount wrapper corrected for accessible Max button.
- Passed: Paycrest NGN/UGX boundary/outage tests; full bills handler suite includingUG andUSDT; catalog-to-client limit test; native NGN/UGX bill-limit UI/presets; bill layout; native Stocks Send display/Max/review; XLayer Send viewport/light-dark; bank receipt-refresh fixture; Privy chunk no-replay tests in both repos; scoped TypeScript. Web/native builds passed before latest stock changes; final rebuild/deploy/install pending.
- Funded settlement, delivery, relaunch and real receipt recovery remain untested. No payment approved or broadcast. Do not count these fixture/quote passes as funded acceptance. Final deployment and Pixel installation evidence to append.


## Final live follow-up 2026-10-29 09:00 UTC

- Backend/web90a8a7c1ad4355a8703bfa4c70c567c504908d75 deployed live as dep-dbhgivg8v5cc738ef7k0 at08:58:44UTC; public-configHTTP200. Prior combined5b98222cc deployment also completed. Release product working tree clean.
- User refined bills UX: no always-visible minimum/maximum range. Small red message appears only when a typed amount is outside current provider bounds, disappears for valid/empty amounts. Existing suggested amounts remain filtered. Quiet red-message browser test passed.
- Live Uganda check exposed an older Nigeria-only default effect resetting ug-246 to mtn. Guarded that reset by countryNG in both repos. Actual-controller browser tests pass NG-to-UG-to-NG, first operator/icon, operator changes and minimum boundaries without signing. Provider GET confirms Uganda Airtel is first (ug-246,operators/6.png); actual Pixel image loaded successfully, not a fallback.
- Final APK built, Gradle succeeded, installed preserving data. SHA2567811ac964be7360d5f9a6a5a2181aeebef6c41ca1efd55a95adcf9ec5f8cd52d; Pixel PID21963. Live NG airtime9 shows red minimum10;10 clears it. Live UG49 shows red minimum50;50 clears it;999999 shows maximum;empty clears all limits. Catalog retry after deployHTTP502 restored the same Uganda screen. Screenshot output/playwright/pocket-ug-bills-fixed.png inspected.
- Stocks Send live on preceding build: Available<0.01NVDAx, Max enabled only after fresh balance, exact0.000000000000000001 inserted. Screenshot output/playwright/pocket-stock-max-fixed.png inspected. Same stock changes retained in final build. No recipient/transfer/PIN submission in these checks.
- Live backend minimum helper recheck produced NGN687.08 and UGX2166.76 as FX moved, proving limits are dynamic rather than hardcoded. The earlier quoted687.16/2166.28 values are historical observations, not current guaranteed amounts.
- Separate outstanding items: intermittent external Privy session/chunk availability (recovery UI improved, provider cause not proven fixed); native safe-area injection warning reproduced on launch (no flicker all-clear); funded bank/wallet settlement, relaunch and real receipt acceptance still untested; existing BNBUSDT over-balance quote misclassification and wider feature parity remain open. No funds moved. No all-flows all-clear.


- Funded acceptance preparation09:02UTC: actual Pixel XLayer Send shows2.37USDT available. Prepared original user recipient0xE292801Ff95620ae2749B8C71A9EABB51E77e851 with2.00USDT; current displayed fee0.01USDT,total2.01USDT. Confirm send and PIN were NOT pressed. Explicit approval requested for this real transfer; do not treat quote preparation or elapsed time as approval. Revalidate quote/fee before any approved execution. No real funded acceptance result yet.


## Checkout quote clock mismatch - 2026-10-29
- Live Lunchroom USDT quote was rejected before submission: expiry 09:17:46.768Z, browser response end 09:17:16.652Z, leaving 30,116ms against an exact 30,000ms client ceiling. The captured quote validates inside its window; replaying validation at receipt reproduced the error.
- Added bounded 5-second tolerance to the future-window check in both web and native source; expiration, fee/total, recipient, signing request binding and server 30-second lifetime remain enforced. No transaction submitted by this audit.
- USDC/USDT client regression checks pass in both repos, including the exact 116ms mismatch, tolerance boundary, expired quote rejection, post-PIN refresh, increased fee rejection and uncertain-send retention. Native source patch is not installed yet.
- Authenticated child chkx_02ed254437fa4523bc494f8c remains pending at verification. Selection chks_1add86a339af43cf92b38161 still returns 409; merchant order status/settlement/receipt acceptance remains open separately.

- Deployment c64f04d2f / dep-dbhh0i5g1s2s73a2hu60 live at 09:27:18Z. Public site HTTP 200; served usePocketStockWallet-C0eeX-_0.js verified with 5,000ms future-window tolerance and unchanged strict expiry check. Hosted checkout browser suite passed all four supported X Layer stablecoins. Old checkout expired; fresh funded acceptance still requires user approval.

## Lunchroom retry recovery
- Observed live POST prepare HTTP 400 Order reference conflict reusing c780287fc8d04f9e9a56351f62919693. JSONB key reorder reproduced the failure; compare basket fields instead of serialized property order. Changed baskets still reject.
- Selected checkout status lost inherited Node IncomingMessage headers via object spread. Preserve headers explicitly when reading the child; regression uses a real IncomingMessage.
- Lunchroom now reads authoritative status before reusing an order: expired creates a fresh reference; pending/missing retain the reference; paid/processing recover the order; unavailable status blocks new creation. Browser checks passed.
- Food demo, hosted merchant checkout and checkout selection regression suites passed. No funds moved by the audit. Deployment/live verification pending.

## Checkout PIN reset continuity
- Verified current browser had been redirected from checkout to pocket.hashpaylink.com after Forgot PIN. Hosted security now returns to the exact checkout path/query after logout; native Pocket default navigation stays unchanged.
- Reset context is scoped to the current tab, checkout URL and server expiry. Checkout requests a fresh Privy email OTP for the same email with signup disabled; inline six-digit OTP is distinct from the new four-digit payment PIN. Successful PIN reset clears the context. No automatic payment submission.
- Browser tests passed reset routing, one OTP request under StrictMode, invalid-code retry, unchanged checkout URL and no account-change control. Backend security smoke passed fresh-session and email-verification checks, old-session rejection and reset-token replay rejection. Actual live reset still needs the user to enter OTP/PIN.

- Release 1cf220373 / dep-dbhh8uo8v5cc738g5jtg live 09:45:53Z. Live parent selection status now HTTP 200 expired, child status HTTP 200 expired, Lunchroom order c780287fc8d04f9e9a56351f62919693 HTTP 200 expired. Previous 409/400 status failure resolved for this order. Served index-Cuy-5icn.js contains inline reset OTP UI.
- Full typecheck reported unrelated repository errors plus one newly introduced helper assertion; removed that unnecessary Request cast (no runtime change). Focused strict helper typecheck and request regression passed. Full repository typecheck remains failing in existing modules and library targets.
- Actual email/PIN reset and funded settlement/receipt recovery remain user-driven acceptance checks. No OTP/PIN captured and no payment submitted by the agent.

## PIN reset eligibility correction
- User reached Reset Pocket PIN after an old pending reset; save returned 401. UI previously trusted presence of local reset token and claimed verified sign-in without server eligibility.
- Added authenticated read-only reset-status preflight using the exact same identity/session/email/time conditions as atomic reset consumption. Stale/replayed/unverified resets show restart-email action instead of PIN fields. Reset rejection after preflight clears entered PINs and offers fresh verification.
- Backend smoke passed expired/used token rejection, repeated non-consuming preflight, fresh OTP session acceptance and existing reset security tests. Real gate browser checks passed stale-reset gating and restart on the same checkout. No OTP/PIN read or payment submitted.

- Eligibility fix 852cba8e4 / dep-dbhhtsgm7kps73evajp0 live 10:30:36Z. Reloaded the user checkout chkx_43f0d392105b4f769d67f507: server preflight HTTP 200; actual screen now Verify email to reset your PIN with Send a new email code, without PIN fields. No OTP requested by agent. Additional browser case passed expiry between preflight and PIN submission.
- Deployment invocation with literal HEAD resolved to old server-default revision; canceled dep-dbhhtoe7bikc73emdb90 during build before live. Replacement used the exact tested commit hash. Always pass the resolved commit hash to Render.

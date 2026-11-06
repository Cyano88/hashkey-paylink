# Production bridge and swap alignment audit — 2026-11-05

## Confirmed production failures and fixes

The Base USDC ? Arbitrum ETH bridge `1ac170a0-44fe-455c-bfac-d67fd894777c` remained source_confirmed even after destination delivery. The production bridge-proof RPC adapter rejected eth_getTransactionByHash, although native delivery verification requires it. Commit 88c36c674c4fa22a568406c80e7aee77e1558e20 adds this read to the strict proof allowlist. Hash validation, finality and canonical/reorg checks remain. Tests now exercise the production adapter rather than only injected RPC fixtures.

Render deployment dep-dbm6t3t9el5s738tbivg became live and health returned HTTP 200. The worker automatically completed the existing operation without resending it or editing its state manually. The Pixel receipt showed Completed and 0.000621605 ETH received.

A second live defect was verified during the Pixel balance audit: Circle returned 0.000018854450176871 ETH with updateDate 2026-11-05T09:24:09Z while the same Arbitrum address held 0.000640459497824501 ETH on-chain. A successful Circle response alone therefore cannot establish display freshness. The shared display readers now compare the provider token snapshot with the durable, verified cross-bridge receipt for that owner, network, wallet and asset. An older or missing snapshot uses the existing RPC fallback; unrelated assets remain Circle-first. Journal lookups coalesce for 15 seconds; existing 30-second balance caches and token retry cooldowns remain. No receipt amount is added to a balance, and settlement/payment authorization is unchanged. A provider timestamp before proof verification conservatively retains fallback until the provider publishes a newer snapshot.

## Native app and Pixel verification

Installed without clearing app data: pocket-production-receipts-20261105.apk, SHA256 166AAD709390C94172281923225F705F142C70989F6884E9455BBC2C9490FBE3. All 1,868 web assets matched the native build. This is the authorized Pixel build, not a public store rollout.

- BNB bridge Activity uses BNB artwork instead of the swap arrows. Native/stable bridge artwork also covers ETH, POL, SOL, OKB, EURC, USDG and USDE.
- The completed BNB ? SOL receipt visibly shows the BNB logo, Bridge label, source/destination networks and received SOL.
- Live Arbitrum USDT ? Base ETH quote reached the review sheet: 0.497134 USDT input, approximately 0.00019635 ETH output, muted USD equivalents, 0.03 USDT fee and 0.53 USDT total at display precision.
- Token pickers loaded balances without an unavailable label during these checks. The stale native balance discovered separately above is not treated as a passing result.
- No new transfer was confirmed or signed by this audit. Fixture route coverage is not evidence of funded execution on every route.

Native source snapshot: pocket-play-update-20261101/native-release/production-alignment-source-20261105.zip. Screenshots and build manifests remain local because they contain user account information.

## Fees and balance architecture

Saved production cross-bridge quotes include 10 bps platform fee and separate reimbursement and platform recipients. The USDC ? ETH operation had 1.530147 USDC principal, 0.009998 USDC reimbursement and 1.540145 USDC total. Its platform fee was 1,530 source units. The completed BNB ? SOL operation had principal 1369849766322470 wei, reimbursement 36657869370333 wei and total 1406507635692803 wei; platform fee 1369849766322 wei. These are saved execution/quote values, not independent proof of realized revenue collection.

Home, Swap and Bridge use shared wallet/native/EURC balance hooks and coalesced caches. Circle supplies Circle wallet display balances first; BSC uses its shared OKX indexed reader first. RPC remains necessary for fallback, transaction validation and settlement proof. The new stale-snapshot guard is in the shared server readers, not a selector-only replacement.

## Validation and limits

Passed production-adapter native-delivery fixtures for Ethereum/Base/Arbitrum/Polygon and direct-client BSC/X Layer coverage; proof budgets and canonical/reorg checks; targeted TypeScript. Passed reimbursement fixtures for 26 network/assets, platform-fee fixtures for 586 cross-asset pairs, eight native/stable reimbursement routes and BSC swap fixtures. Native Activity and receipt tests passed, including narrow 320/426 pixel receipt layouts.

New freshness regression covers the observed native discrepancy, cached fallback, provider catch-up, absent rows, owner/network/wallet/token isolation and token refunds. Existing native, Circle token and USDT display regressions are retained.

Open policy: the older Arc swap path has no explicit reimbursement transfer or configured platform fee. A pricing decision is pending between bridge-style cost reimbursement plus 0.1% platform fee and continued sponsorship. This audit does not silently introduce new charges or claim all swap fee policies are aligned. Testing does not establish universal absence of flicker or funded execution across every pair.

## Deployment confirmation

Freshness fix commit 7511a87d29a6c0195ca3f472760d887eb190ac93 deployed as dep-dbm7dmc9v7es7393fcc0, live at 2026-11-05T12:35:40Z. Post-startup health returned HTTP 200. A lightweight production read through the deployed settlement freshness module returned verifiedAt 1793880007968 and rejected Circle's unchanged 09:24:09Z ETH snapshot (staleSnapshotFallsBack: true). The dedicated display-reader TypeScript check passed as well as the broader cross-bridge check.

Pocket left the foreground before the deployment completed. The post-deployment numeric Home total was therefore not visually reverified; device taps stopped to avoid interacting with another app. The earlier cross-asset review and installed BNB receipt checks remain valid. Arc swap pricing remains pending user decision.

## Pixel recheck after user reopened Pocket

At approximately 13:53–13:55 Africa/Lagos on 2026-11-05, Home visibly showed total 10.32 USD. Arbitrum Swap showed available 0.000640459 ETH and network total approximately 2.65 USD. Bridge's Arbitrum token sheet showed the same 0.000640459 ETH, approximately 1.53 USD, alongside 0.13 USDC and 0.99 USDT. This closes the post-deployment visual balance check above. No unavailable label was present in these checked views. No transaction was submitted. Screenshots remain local under output/bridge-swap-audit-20261105 in the native checkout.

## Second audit pass (13:56 onward, Africa/Lagos)

Live Pixel checks reached review for SOL on Solana ? BNB on BNB Chain (0.007611242 SOL input, approximately 0.000975426 BNB received, 0.000660241 SOL reimbursement at that quote), Arbitrum ETH ? USDC swap, and Arc USDC ? EURC swap. Arc EURC ? USDC also returned a live quote after token reversal without changing the network. Arc EURC ? Base EURC returned a quote and reached review. No confirm/approval/signing action was taken.

Found a remaining visual defect on Arc EURC ? Base EURC: the incoming fiat estimate disappeared when destination EURC holdings were zero, although a valid EURC valuation existed on Arc. PocketSwapPage divided only the destination holding value by its quantity. The native correction uses a known, healthy same-asset holding valuation from another supported network when the selected network has no positive holding. It does not infer EURC = USD, copy another asset's price, add RPC calls, or change execution amounts. It also covers ETH held on another supported network. If no healthy same-asset valuation exists, the estimate remains unknown.

Passed regression suites in this pass:
- Six-network swap cancellation matrix: unsigned drafts clear; signed/ambiguous operations remain recoverable; no dispatch.
- Fourteen cross-asset bridge review cases; eight-network stale selection and expired quote handling; 96 asset/network resolutions.
- Native selector balances on five networks; bridge draft lifecycle at 320/426px; bridge selector layout at four widths in both themes; clean exchange receipts at narrow/Pixel widths.
- App-independent cross-bridge recovery, provider identity and source-proof enforcement, mutation races, fairness beyond 50 operations and max-three recovery concurrency; six CCTP source workers and ambiguous-status rejection.
- New empty-destination EURC/ETH fiat regression, local FX, expired FX, asset isolation and unavailable holdings; existing swap fiat regressions; targeted native TypeScript.

The Render error-level log query during the initial live test window returned no entries. This is a bounded log check, not proof that all provider requests or every route always succeed. Fixtures remain distinct from funded live transfers.

User asked whether token values should be smaller. Recommendation: reduce primary amount typography by approximately 10–15%, preserving a smaller muted fiat line and clear review totals. No typography change was made in this audit.

The native fix built successfully and was installed without clearing data as pocket-empty-destination-fiat-20261105.apk (SHA256 722D43F2AE73A5E4116F7089EEADFAE1F025A0F46924D7BE823BC108113577C2). All 1,868 packaged web assets matched dist. Source snapshot: native-release/empty-destination-fiat-source-20261105.zip in the native checkout. At 14:15 Africa/Lagos, the same Arc EURC ? Base EURC quote visibly showed the previously missing incoming estimate, approximately 0.31 USD. Home remained 10.32 USD after installation. No new funds were sent. A transient local ADB daemon restart interrupted navigation; connection recovered and the route was reselected before verifying the fix.
At 14:16 the installed review sheet also showed the incoming approximately 0.31 USD line, plus paid-with, fee and total fiat values. The review was closed without proceeding.

## Final UI/UX audit

Scope: exchange amount legibility, token/network controls, sheet focus and dismissal, loading stability, light/dark rendering, fiat consistency and receipt presentation. Existing functional route/recovery results above remain separate from these UI checks.

Found and corrected in the native checkout:
- Long native decimal values could scroll horizontally inside a readonly amount input. Shared Swap/Bridge amount typography is now approximately 10–13% smaller for ordinary values, with width-aware fitting for long values. Exceptionally long values receive a slightly narrower column gap. Input state, token precision, transaction amounts and existing display rounding rules are unchanged.
- Value rows keep a fixed line height so amount fitting does not move the action button.
- Bottom-sheet Close now has a 44px square target, matching the other exchange controls; icon size and dismissal rules are unchanged.

Verification: actual bundled font and brand assets; 320/360/426px light/dark layouts; a full one-wei ETH value without clipping or precision change; no page overflow; stable action position; focus stays within the sheet and returns to the selector after Escape. Broader four-width/two-theme bridge layout, fiat readiness/receipt stability, USD/NGN/UGX selector valuation, receipt clarity and draft cancellation tests passed. One older selector fixture still expected the retired Unavailable label; it now checks the existing accessible updating state and confirms that unknown is not shown as zero. These checks are not a full assistive-technology or formal accessibility certification.

Installed final native build: pocket-final-ui-ux-20261105.apk, SHA256 5FA4427CE2B8120275AE97392737638C9D095B2989B983DFE3B55B600972944A. All 1,868 packaged web assets matched dist; targeted TypeScript and Android release build passed. Installed on the authorized Pixel without clearing data. Source snapshot: native-release/final-ui-ux-source-20261105.zip in the native checkout. No public store rollout.

At 14:35-14:40 Africa/Lagos, the installed Pixel showed the reduced amount typography, correct Arbitrum ETH selector balance, and muted fiat estimates. Live Arbitrum ETH to USDC Swap reached review with received amount, network fee and total. Live Arbitrum USDT to Base USDT Bridge reached review after refreshing its quote: 0.497134 USDT input, approximately 0.48 USDT received, 0.03 USDT fee and 0.53 USDT total at display precision. Both review sheets showed fiat equivalents and network identity. The enlarged Close control dismissed the review. No new payment was confirmed or signed. Live quote/review checks do not establish funded settlement on every route; Arc swap pricing remains the open policy decision described above.

## Follow-up: sheet opening and first-paint audit

User reported a network sheet appearing transparent before filling. The settled current screen was the Bridge network selector. The captured pre-change opening did not conclusively reproduce the intermittent transparency; this audit does not claim a proven original root cause. Source inspection found shared sheet focus/scroll setup in a passive effect and body scroll restoration without the reference counting already used for internal scrollers.

Native changes: run focus and scroll locking in a layout effect before paint; use preventScroll for focus entry/restoration; include body in reference-counted locks so out-of-order nested dismissal cannot unlock it prematurely. The shared surface now explicitly owns an opaque light/dark background, opacity 1, paint containment, isolation and no background transition. This covers PocketBottomSheet consumers across selectors and review/progress sheets.

Passed new first-20-frame checks at 6x CPU throttling in light/dark and 320/426px: opaque surface, pre-paint focus, background lock, unchanged scroll position, and correct nested lock release. Existing amount fitting/focus, four-width bridge controls, receipt readiness/stability and draft lifecycle suites passed; targeted TypeScript and Android release build passed.

Installed pocket-sheet-paint-20261105.apk on the Pixel without clearing data. SHA256 73EC66AB59199B7E6A3A73160D167F98457979E41207976485D7780953A57BA1; all 1,868 packaged web assets matched dist. Source snapshot: native-release/sheet-paint-source-20261105.zip. Repeated installed network and asset selector openings were recorded and inspected; sampled opening frames showed opaque panels, with no observed delayed fill. Recordings remain local. This is bounded verification, not proof the original intermittent condition can never recur. No transaction was confirmed; no public store rollout or backend code change.

## Bank and regular receipt display delay

The shared FullScreenReceiptSurface hid its already-built ReceiptDocument until all descendant images and document.fonts.ready settled, with a 1,200ms timeout. This visual readiness gate was introduced by an earlier stability fix and unnecessarily delayed access to transaction details. PocketActivityReceipt already constructs its receipt from the selected activity row; this gate was not a wait for bank settlement data.

Removed the whole-document visibility gate and timer. Receipt details now render at mount. Existing fixed-size bank/provider mark placeholders reserve their space during logo loading. Image/PDF generation retains its separate font/image preparation and existing native sharing path. No amounts, status interpretation or settlement behavior changed.

The bank/regular receipt regression now deliberately keeps document.fonts.ready unresolved and delays images by two seconds, and verifies that receipt text is visible in the mount mutation callback. It passed for bank and regular transfers; existing fiat-layout stability, narrow/Pixel exchange receipt readability and targeted TypeScript also passed.

Installed pocket-receipt-immediate-20261105.apk, SHA256 5CE984B46D93C8893B1210C9556B3B70BEC73433DFD086A53630FF52F50DE6FC; all 1,868 web assets verified against dist, Android build passed, no data cleared. Source snapshot: native-release/receipt-immediate-source-20261105.zip. After the user reopened Pocket, bank and incoming wallet receipts were visually checked. A recorded reopening of the existing NGN 2,100 bank receipt showed the details together in the first sampled receipt frame, without a Preparing receipt phase. No transfer or external share was made. No public store rollout.

## Balance display continuity and indexed yield - November 5

Installed native-only update: keep the same owner/network/asset last-known balance visible without any Last known label, as explicitly requested. Removed timed Refresh balance fallback; retry appears only on settled failure with no displayable value. Complete totals retain a previous complete value, not a partial sum. Confirmed zero replaces the retained value. Transaction, Max, review and execution freshness checks remain separate.

Yield details now use the shared OKX-first X Layer snapshot (including receipt tokens) for initial balances. Fresh Aave position checks remain when starting deposit/withdrawal and at review/execution; protocol market checks and RPC fallback remain. Stocks already use the shared indexed display path. No backend deployment or funded transaction was performed.

Passed targeted refresh/yield, retained-value scope/zero, Earn sheet/browser, indexed-provider, stock-outage, stock-valuation, bridge layout and selector fiat regression checks, plus TypeScript and Android release build. The obsolete stock-balance-browser harness could not bundle its old whole-Home mocks and was not counted as passing.

APK: pocket-balance-display-20261105.apk
SHA256: 2C0EAAD944C95721BC4FA75DEEA9EA11DD1E381A2E690AE4E775E406ABFF9BFD
All 1869 dist assets matched the signed APK. ADB install -r succeeded on Pixel 5A160DLCH006VM. Captured installed Bridge and Stocks screens showed numeric balances without a Last known label. Cold Home capture still showed initial total loading; no complete post-install Home/Earn refresh-cycle claim is made. Concurrent manual phone navigation prevented a deterministic remaining screen walkthrough; automated taps were stopped. No new payments.

Native evidence: native-release/balance-display-20261105.json and balance-display-source-20261105.zip in pocket-play-update-20261101. Screenshot filenames balance-home.png and balance-swap.png actually captured Bridge and Stocks respectively because of concurrent navigation; interpret their image contents, not filenames.

### Follow-up Pixel walkthrough and final APY correction

After the user handed over the phone, completed Home/Swap/Earn navigation. Home showed 10.08 USD and retained it on return. Base Swap showed 0.00000809497 ETH; its asset sheet showed ETH, USDC, USDT and EURC with muted USD values and no refresh prompt or Last known label. USDC Earn displayed sub-cent earning and available balances; USDT0 displayed 0.00 earning and 2.02 available. Reopened USDC retained balance presentation. Earned-so-far is a separately fetched metric and initially shimmered before resolving.

The walkthrough caught a periodic APY refresh clearing a previously displayed rate. Removed that clearing and suppressed failure copy when a previous rate exists. Added pocket-earn-rate-continuity-smoke.mjs: actual Earn page retains 3.70% through a clock-driven periodic pending read and rejected read. Passed this browser check, TypeScript, and rebuilt Android release.

Final replacement APK (same filename) SHA256: 6D90327FFDCC1C1D7596AFB121D75A9951E24308C76F5376DC0E186CF341864E. All 1869 assets matched; signature verified; Pixel install succeeded and app reopened. This supersedes the earlier APK hash above. Updated source archive includes PocketEarnPage and the rate continuity test. No funded actions or backend deployment.

## Exchange flow and Max update (2026-11-05 evening)

Native checkout: C:\Users\USER\pocket-play-update-20261101.
Installed Pixel APK: native-release/pocket-exchange-flow-parity-20261105.apk.
SHA256: 83DE74546B35E978254A9054EDD1B344A8770A368A2C470DBEFC9130B273291E.
All 1869 packaged web assets verified against dist; Android build, signing verification and adb install succeeded. Backend code unchanged (7511a87d29a6c0195ca3f472760d887eb190ac93).

Bridge presentation follows the existing bank handoff distinction: Bridging CTA until verified handoff or completion; shared result sheet; Done removes the active form and leaves durable Activity recovery. A transaction hash alone does not authorize the handoff result. Handoff does not mutate journal settlement status. Submitted legacy bridge records no longer restore themselves into a fresh form; unsigned approvals remain recoverable. Native and Arc swap dismissal retains recovery journals while clearing form state.

Confirmation headline remains destination token amount with muted fiat equivalent; Paid with is the source asset. Result summary uses source asset. Pixel inspection showed 0.94 USDC / approximately 0.94 USD and Paid with 0.97 USDT for Arbitrum USDT to Base USDC. No assistant confirmation, signing or transfer performed.

Max: source and destination amount feedback during fee-adjusted calculation; source fills with the final amount. Cross-bridge duplicate debounce request suppressed while quoting. Manual edits invalidate pending Max. Shared source input remains mounted to preserve keyboard/manual cancellation. Legacy bridge and swap layouts receive maximum-calculation feedback.

Passed: focused TypeScript; bridge lifecycle 56 directed network pairs; sheet evidence matrix 56 pairs; 14 cross-asset review cases; cross-bridge panel flows Base, BNB, X Layer, Solana USDC and SOL, Polygon, Arc; swap presets eight networks at 320/426 widths and late-Max manual override; seven legacy bridge Max rails; six native-swap cancel networks; seven cash-funding source networks. These are fixture checks, not live transfers on every route.

Live existing ETH to USDC operation df3df9a8-e437-4af1-b7c8-5688f633a375 is now completed with verified Base settlement 1397421 units (1.397421 USDC). Source proof and fee evidence were validated separately; no status override performed.

Remaining test-harness limitations: older native delayed-recovery fixture cannot bundle because its wallet mocks omit exports; old Arc cancellation/reopen scenarios assume the superseded restoration flow. Arc cancel/success/failure/unknown-dismiss scenarios passed, but full legacy Arc harness has not passed. Do not represent those suites or a full live financial matrix as verified. Pixel was actively being used; observed Max loading then final source amount and populated confirmation, without changing the user's selected route or submitting it.

## Quote feedback and usable review time

Native: cross-bridge fee-rejection notices are consumed by one replacement quote, cleared during fresh requests, and shown only if amount/receive/fee/total changed. Native EVM/Solana swap rejection refresh similarly clears stale text and compares the returned amounts before prompting review. Routine quote expiry still blocks execution.
Backend: stable-input native EVM quote issuance now starts at the latest executable route request, not approval lookup and discarded calibration routes. The signed 45-second bound, router deadline, approved debit, reimbursement and fee caps remain intact. Expiry during native execution preflight now returns swap_quote_expired rather than incorrectly reporting network fees changed. Cross-bridge preflight checks expiry before interpreting fresh costs as a changed fee.
Validation passed: focused backend/native TypeScript, eight stable-input reimbursement routes including slow-request clock assertions (33 seconds left after the final route request and fee estimate), native API expiry-during-estimate rejection with no claim/challenge, existing four-network fee-buffer matrix, 13 Circle bridge quote/preflight cases, and 26 reimbursement asset cases. Browser fixtures passed seven cross-bridge adapter cases plus changed/unchanged replacement notice checks; five native swap networks passed fresh-review and unchanged-rejection notice cases. No assistant-funded transfer. Final deployment and Pixel verification recorded separately below.

Deployment/Pixel verification: backend 386ae27856c8705680f66b1662700737be7ea77f is live on Render (dep-dbmclgek1f9s73bbdf60). Health recovered to HTTP 200 with pocket.healthy/database true and zero unresolved/stale after the deployment restart. Pixel replacement APK native-release/pocket-quote-lifetime-20261105.apk SHA256 79864A4E63A6E0DA6E4E74B3B1DF4527765CC0E05195FB93B6CA1CD0D8EF63E7; signature and all 1869 assets verified, install succeeded. Source snapshot quote-lifetime-source-20261105.zip preserved.
At approximately 19:35-19:38 Lagos, Pixel Base USDC -> Arbitrum USDT Max showed both loading fields, populated source, and a clean confirmation after refresh (1.36 USDT received; source/fee/total separately shown). Base USDC -> ETH swap review showed 0.000142044 ETH, approximately 0.32 USD, Paid with 0.35 USDC, fee 0.03 USDC included, without the previous stale no-swap-sent notice. Both drafts cleared on Close. No assistant confirmation/signing/payment. These are live quote/review observations, not funded execution of every route. Contract/provider deadlines and existing maximum quote TTLs were not extended; the native stable-input clock bug was corrected within those bounds.

### Follow-up: confirmation window and unresolved live repricing
- Installed pocket-bridge-confirm-window-20261105.apk on Pixel 5A160DLCH006VM; SHA256 36A066CBCCF1E91C827205FC0657D091AAF7C17DCF04A81F8C0F13A49E35C287. All 1869 bundled assets match the native dist; signed APK verified; adb install returned Success.
- Shared cross-bridge submission checks now use a 5-second dispatch buffer instead of the 20-second preview freshness window, including checks before and after PIN. Server expiry and fee coverage remain unchanged.
- Typecheck and Android build passed. Seven browser source cases passed with 12 seconds remaining at review and a simulated 3-second PIN delay, asserting one dispatch/signature. This is fixture evidence, not a live payment.
- Pixel live observation after installation still shows Review the updated amount before confirming on Arbitrum USDT to Base USDC. The exact source amount changed to 0.966681 while rounded receive/fee/total remain 0.94/0.03/0.99. Screenshot balance-confirm-window-review-ready.png. Do NOT mark the recurring repricing issue resolved.
- That notice is generated by the cross_bridge_fee_changed recovery path, not by the expiry guard. Production runtime uses crossBridgePreflight in cross-bridge-quote.ts. Circle reimbursement policy has zero margin; fresh coverage can exceed the approved fee. Do not change economic policy or waive coverage merely to hide the notice. Further diagnostic evidence is required to distinguish gas-estimate movement from price conversion movement.
- No new payment was initiated by the assistant. Native source snapshot and installation manifest retained under native-release/bridge-confirm-window-*.

### Deep quote/review stability audit - implementation and fixture evidence
- Root causes: Circle EVM cross-bridge policy reserved an unbuffered estimate, unlike native swaps; pricing-snapshot expiry shortened executable reviews; refreshed valid quotes below the 20-second preview threshold could leave review opening pending.
- Circle EVM cross-bridge quotes now include the existing native 50% gas allowance and Circle Gas Station's 5% service charge in the fee reviewed before approval. This can increase the up-front quoted fee. It is not added after approval. The existing fee maximum, configured minimum, platform app fee and recipient binding remain enforced. Privy-sponsored policy and Solana rent/fee policy are unchanged.
- Circle fee source checked: https://help.circle.com/support/en/developer-services-product-fee-schedule?id=kb_article_view&sysparm_article=KB0010546 (Gas Station: network cost plus 5% service charge; local taxes depend on billing). No new tax assumption was added.
- Quote-time and preflight price freshness remain 30 seconds. Executable review expiry follows the existing provider route limit of 45 seconds, capped by conversion/provider deadlines and aged from the provider request. It no longer expires with the price observation timestamp. Both prepare and submit retain fresh cost, balance, wallet and policy checks. Signed/recovered operation idempotency is unchanged.
- Native send/swap allowance is shared through native-fee-policy.ts with no change to their existing numerical fee behavior. Shared cross-bridge submission buffer remains 5 seconds. A newly fetched valid review can open below the 20-second preview-reuse threshold, preventing a dead end.
- Added production-preflight regression across 26 source/assets: old-but-fresh price snapshot, repeated gas jitter, immutable approval, cost cap, stale prices, balance loss, expiry during estimation, recovery-only expired reviews. Passed.
- Passed backend typecheck; 586 provider route combinations; 26 reimbursement assets; 13 Circle quote/preflight flows; durable operations, API, Circle/Privy/Solana adapters and sponsored-batch checks; native send, four EVM swap networks in both directions, stable-input reimbursement and native swap API checks.
- Browser checks: 14 cross-asset review routes and new 12s/21s fresh-review cases passed. Pixel/live verification follows deployment; fixture passes are not live payment evidence.
- Fee rejection diagnostics contain only source/asset, reserved/required/cap units and quote timing. No wallet addresses, tokens, signatures, credentials or full provider payloads are logged.

### Approved live test and unified success/delay follow-up
- User explicitly approved one Arbitrum USDT -> Base USDC test capped at 0.99 USDT total, 0.06 USDT fee, minimum 0.90 USDC received, then requested observation and one success label for bridge/swap.
- Live operation 58e0c1b9-e2bc-4d30-bf23-699072dee121: source amount 0.93 USDT, exact total 0.973296 USDT, exact fee 0.043296 USDT; provider expected 0.906387 USDC, minimum 0.901946 USDC. Exactly one matching operation was found.
- Source hash 0xd1130ef9a706441a3522f7bb9e077933055e052818959ac79ad08aad6847f015; destination hash 0x92321a98f64fac5cc689b90ece31170a0825721df05af5a77877ea3eeb534dc8. Relay status success and independently observed canonical Base receipt for 0.906387 USDC. Journal remained submitted pending finality when inspected; do not describe it as final ledger settlement yet. No quote-rejection loop occurred during this live submission.
- Render deployment dep-dbmdk1ec6qcc73ehb0g0 is live on 20d26848d468b4d186461018ee30258da1fa47df; health HTTP 200, database true, Pocket healthy. Pixel installed APK CD7FE93F42800795AAC5D5AD1F9C815CC8630F9A8810DF4910D60C48F910CBA2 with 1869 verified assets. Screens show both Max loading fields, clean confirmation and verified handoff.
- Follow-up per user: one Bridge successful heading for verified handoff/final result, matching Swap successful. Internal Activity settlement state remains accurate; changing presentation must not mark pending journal rows completed. Cash-specific wording remains separate.
- Delay audit: live cross-bridge status responses included 17.1s and 19.4s responses. Code serialized source proof before provider/destination reads. Independent proof reads now run concurrently, while source failure takes precedence and both finalized proofs are still needed for terminal ledger publication. Added deferred-promise regression proving concurrency and no early ledger completion.
- Native swap recovery previously used general backoff up to 30s. Native swap and shared swap/bridge recovery now use recent 4s and older 8s scheduling, preserving Retry-After, hidden-tab and execution guards. No artificial success delay added.
- Unified label browser test passed 56 directed pairs, quiet completion after Done, no hash-only success and no repeat sends. Recovery schedule tests passed both swap/bridge timings and throttles. Final follow-up build/deploy verification is pending below.

### Final follow-up deployment and artifact
- Backend ed8cf0c61efce4c72164f17817b242b3b8bb9e09 deployed live as dep-dbmdv2mk1f9s73diekog. Health recovered to HTTP 200 after restart: Pocket healthy, database true, unresolved/stale zero.
- Final Pixel APK: native-release/pocket-exchange-success-20261105.apk, SHA256 ABA521B72BF88FDF6B29370DF9E88F443AD11801CF805890C2F7B207721E3120. Signed, all 1869 assets verified, adb install Success. Source snapshot: native-release/exchange-success-source-20261105.zip in the native checkout. Manifest records installation and backend revision.
- Final native changes: Bridge successful replaces Bridge sent in the verified result sheet; Swap successful retained across native/Arc/stock swap results. Pending has no separate result sheet. Review stays in Bridging/Confirming while verification runs; Activity retains underlying pending/final states.
- Shared and native swap recovery now retain 4s recent / 8s older status cadence instead of backing off to 30s; throttles remain enforced. Backend independent proof concurrency passed all settlement, operations, recovery-audit and delivery regressions. Native typecheck and Android build passed.
- Direct read-only public RPC check confirmed both receipts status 0x1. Base finality reached its destination receipt; Arbitrum finalized height was 0x1f1699c0 while the source receipt is at 0x1f1699f4. This is a real finality wait, not an artificial UI timer. Existing accounting finality requirements were not weakened.
- One approved live payment only. No additional swap/bridge was sent for the final label/polling build. Existing approved operation continues background reconciliation; final ledger state must be checked separately from successful delivery.

### Final live completion verified
- At 2026-11-05 20:07:28.071 UTC, operation 58e0c1b9-e2bc-4d30-bf23-699072dee121 became completed with finalized settlement amount 906387 source units of Base USDC (0.906387 USDC). Ledger publication confirmed at 20:07:30.080 UTC (ledgerPublishedAt 1793909250080).
- Both source and destination receipts have successful status and finalized heights beyond their inclusion blocks. Exactly one matching operation remains; no repeated dispatch/debit.
- Pixel Home removed Processing; opening the same receipt shows Completed, Paid with 0.93 USDT, Received 0.91 USDC and Fee 0.04 USDT using accepted display precision. Screenshot: output/bridge-swap-audit-20261105/balance-exchange-live-completed-receipt.png in the native checkout.
- This closes the observed finality/reconciliation check. The earlier pending-finality notes above are chronological evidence, not the current status. Other routes were validated with fixtures, not additional live payments.

## 2026-11-05 Pixel Polygon Max fee rejection
- Pixel showed Polygon POL -> Base USDC, 20.7608 POL available, zero draft after failed Max, and generic Bridge fees are unavailable.
- Deployed 647a0a0d01703091076c02d6a6937368451b1297 with safe internal fee rejection reasons. Repeated Max without confirmation or transfer.
- Production log at 20:33:19.307566804Z: reason fee_limit; nativeUnits 922455509019726241 POL base units; buffered reimbursement 1452867580986643910; configured maximum 1061904013009598444. Approximate USD reimbursement $0.137 vs global $0.10 maximum. Live OKX POL price read was fresh (88ms age). This is a fee policy rejection, not an unavailable balance or missing route.
- 27706d070 changes customer copy to Network fees are high. Try this route again shortly. and adds optional POCKET_CROSS_BRIDGE_POLYGON_MAX_FEE_USD_MICROS. No environment limit changed. Requested user decision before raising Polygon ceiling to $0.25; pending response.
- Focused TypeScript and production-preflight stability smoke passed 26 source/assets plus captured Polygon estimate regression. Override absent retains $0.10; proposed $0.25 permits captured reserve without changing another network or gas reserve calculation.
- Native progress-label fix installed separately: pocket-bridge-progress-uniform-20261105.apk, SHA256 4D7A7E97FF5C7AA2BA2967D37EB7DBEA55E281EFE894AA99C26B26EA0864C17E. Shared form busy flag no longer masks Bridging; automated lifecycle checked 56 directed pairs. No new live transfer submitted by agent.

## All-network fee limit follow-through
- User expanded the instruction to check and fix affected swap/bridge networks. Applied the previously proposed Polygon-only $0.25 ceiling: POCKET_CROSS_BRIDGE_POLYGON_MAX_FEE_USD_MICROS=250000, saved and GET-verified via Render. Global cross-bridge and legacy X Layer/BNB limits remain unchanged.
- Live configuration audit: global cross bridge minimum $0.01 and maximum $0.10; legacy X Layer and BNB stablecoin maximum 100000 six-decimal units; observed-cost policy allowance 285 USD micros, margin 2500bps.
- c2381f698 shares a fee-limit error across cross bridge, BNB swap/bridge, X Layer reimbursement and Solana priority/network fee guards. BNB HTTP sanitization now preserves the safe fee-limit message. Other validation failures remain distinct. Cross bridge supports per-source overrides for all eight networks; legacy BNB can override its limit separately without changing X Layer. Defaults are preserved when overrides are absent.
- Audited native EVM swaps: dynamic reviewed reserve, no shared $0.10 USD cap. Arc swap quote fees come from its provider and do not use the cross-bridge cap. Solana native swap retains 100000 priority and 200000 total lamport guards. No unsupported assertion that these guards are causing live failures.
- Validation passed: expanded TypeScript; cross preflight/fee regression on 26 source/assets; independent override isolation for every source; captured Polygon fee; BNB swap and bridge price/cap reporting plus HTTP propagation; X Layer complete-cost guard; Solana envelope/preflight/API exact approved fee/message and cancellation; cross bridge API ownership/gating/idempotency. Provider and network failures were not converted to success.
- Live Polygon Max recheck pending final deployment. No new payment submitted.

## Shared visible outcome alignment
- Backend 992397a3f and native update share verified success presentation between sheet and Activity. Confirmed delivery carries actual output amount; hash alone remains processing. Durable execution state and ledger finality are unchanged and recovery continues.
- Native swap panels cache terminal responses immediately before success. Snapshot merging recognizes the same exchange across local/server IDs without merging different principal amounts. Arc and BNB receipts retain actual output asset/amount. Failure/refund correction supersedes provisional bridge completion.
- Validation passed: backend and native focused TypeScript; server Activity fixture over 56 directed network pairs; actual bridge browser lifecycle over 56 pairs; actual native swap panel over five Circle networks; all eight swap network snapshot checks; operation identity and bridge Activity regressions. These are automated fixtures, not 56 live payments.
- Live Polygon Max succeeded after the fee deployment. Agent tapped Max only (screenshot balance-all-network-fee-max-request.png); user independently progressed the transfer. POL principal 20.059475700259189325, fee 0.701354136793923857, total 20.760829837053113182; output 1.857823 USDC. Operation 02fac03a-c496-4383-80a3-4bf7fc096635 is now completed, ledgerPublishedAt 1793913062377. Current Pixel Home no longer shows Processing.
- Live X Layer -> Polygon and Arbitrum -> Base operations also remain completed with ledger publication. No additional payment submitted for this consistency update.
- Outcome release deployed: 992397a3f, Render dep-dbmf4fh5efls73e5ntmg live, health HTTP 200 after restart.
- Pixel APK pocket-exchange-outcome-20261105.apk signed/verified and adb install Success; SHA256 4E6E012F0453BB14229B4A29F8CE7C9986549D561C936E2E874341D14E107F30; 1869 packaged assets matched. Source snapshot exchange-outcome-source-20261105.zip includes changed sources and regressions. No public mobile rollout.
- Pre-install Pixel receipt verified Completed, paid 20.0595 POL, received 1.86 USDC, Polygon -> Base (accepted display rounding). After installation the phone was in another app; foreground guard prevented taps. No new Pocket crash after installation. Final post-install visual check awaits Pocket foreground; do not treat the pre-install screenshot as proof of the new build.

## Arc EURC review disappearance and preparation latency
- User reported Arc EURC -> Base sheet disappeared. Read-only production record 7b674a9b-df16-4f3d-a5e5-58410b1bdb25 is cancelled, with no source hash/challenge. Relay remains waiting. The transaction was not sent.
- Production fee rejection: submit reservedUnits 37476 EURC, requiredUnits 53595, maximumUnits 89192, quoteAgeMs 24201, remainingMs 18846. Native recovery published cancellation while the tracked progress component still owned the review, closing it before replacement quote.
- Native now keeps Circle on Preparing bridge until its confirmation; Privy enters Bridging at dispatch. Fee recovery clears the active tracking first and preserves the original review while refreshing. Unknown outcomes stay in recovery, never auto-resubmit.
- Backend 2c4d9dd56 adds opt-in combined prepare/submit for Circle only. Same authenticated runtime and reservation path; Privy combined dispatch is rejected. Within that single request an identical estimate may be reused for <=2s, never across requests; balance, wallet ownership, fee policy, coverage and expiry are rechecked. Quote balance and estimate reads run concurrently.
- Passed backend API gate/combined dispatch tests, 26 source-asset preflight regressions including 2s estimate scope and fresh balance, 13 Circle quote/preflight flows, reimbursement exact plans/decimals and cap guards, focused TypeScript. Native panel browser passed Base, BNB, X Layer, Solana USDC/SOL, Polygon POL, Arc EURC including fee rejection, expiry, single signature/dispatch and uncertain outcome. Live new-build testing follows separately.
- Live Pixel test on installed fast build: Arc EURC -> Base USDC, principal 0.20 EURC, reimbursement 0.043458 EURC, total 0.243458 EURC. Operation a3cba84f-830c-463e-8520-5fc94034b05a; source 0x422927a9bb014efca9ed6c4f544a8fadb3e59e12c22dca1b2297e76b2faf8e9a; delivered 0.201342 USDC at 0xe6b0e6cfe64c27bb227ac4085db48f4497a815059bc75b74771bb7a157cae01a. Provider success and canonical destination observation verified; financial journal still source_confirmed at this read, awaiting finality.
- Pixel captured Preparing bridge, then Bridging, then Bridge successful with 0.20 EURC. No disappearance. Circle-specific confirmation itself was not captured between screenshots; do not claim its visual timing from these samples. Combined preparation server duration 6944ms. Live quote server durations 2373ms, 2015ms, 2387ms. Slow manual automation let earlier reviews expire; refreshed reviews remained open.
- APK pocket-bridge-circle-fast-20261105.apk installed successfully, SHA256 F6B53A217D64436317EF9B51A1FEF0ACEDA33D8C42BE0F7EDA071A559DD4C664, 1869 verified packaged assets. Backend deploy dep-dbmfi5h5efls73e73pc0 live, health HTTP 200. Automated panel coverage additionally passed Ethereum and Arbitrum, covering all eight source networks.

## Follow-up live audit and remaining verification
- Arc test a3cba84f-830c-463e-8520-5fc94034b05a is now completed, finalized destination amount 201342 USDC base units, ledgerPublishedAt 1793916903781. Provider success, destination proof and accounting publication agree.
- Early-delivery receipt was missing the received amount because the background recovery hook retained amountOut only at final journal completion. Native recovery now retains it when destination delivery is verified, while preserving the processing accounting state until finality. Browser regression checks observed and confirmed delivery plus an unverified negative case.
- Live BNB USDC Max produced a generic request error with only about 0.09 USDC available. Parallel quote estimation could reject before balance affordability supplied the maximum amount hint. Backend aa25b7b95 gives insufficient-balance evidence priority over a concurrent estimate failure; funded estimate errors still propagate. Both failure-order regressions pass for all 26 source assets. Render dep-dbmfsfijnfac73dgk39g is live and health returned HTTP 200. Pixel retest remains outstanding.
- Final native artifact pocket-bridge-live-audit-20261105.apk built and signed; SHA256 B4909991C4B7BEF946FD04F13EAAEFF85D7C480EF76A1CC559E80D66CDF040F0; 1869 packaged assets verified. Not installed yet while the swap approval test is open.
- Base USDC -> ETH test overlapped the backend deployment restart before submission. Recovery reported No swap was sent, with no new native-swap journal record. Fresh review for 0.20 USDC opened; the test currently awaits the user's phone-only PIN approval. This is not a successful live swap result.

## 2026-11-06 Pixel retry and Privy expiry audit
- Installed pocket-bridge-live-audit-20261105.apk successfully on Pixel (B4909991C4B7BEF946FD04F13EAAEFF85D7C480EF76A1CC559E80D66CDF040F0). Receipt output recovery fix is now installed.
- Live Base USDC -> ETH swap completed: operation d7d41624-c247-477d-8d3c-41e56b1a32c5, 0.20 USDC input, actual output 0.000069063027368545 ETH, transaction 0x5a7f87e6a4548c592e216394025f372b180a44579af9a3e50ace5aaeef165318. Pixel showed Swap successful and receipt Confirmed with correct input/output/fee. Server completed record agrees. Screens retry-observe and retry-swap-receipt.
- BNB Max live retest passed quote/amount filling: both amount placeholders appeared, then principal about 0.07 USDC and output about 0.04 USDT. No generic error. Actual principal in final attempt 0.065517956571123630, reimbursement 0.028832257817967973, total 0.094350214389091603 USDC.
- First two BNB preparations cancelled unsigned after reaching the quote deadline (87b028a2-16e6-4b23-b5b5-276f6793f093 and 54b67637-85bc-4dc4-b4fa-f7c3e31db581). Reviews remained open. Preparation durations 6923ms and 10104ms plus screenshot/user delay consumed the quote lifetime. A subsequent attempt returned BSC connection temporarily unavailable in a preflight billing dependency.
- BNB -> Arbitrum attempt 3dd3ff26-5413-48a3-95be-a1f4e007e178 entered submitting with no retained provider reference. Relay still waiting. Do not call it a successful bridge or infer failure solely from elapsed time. No repeat dispatch performed.
- Found a deterministic gap after durable reservation: final wallet verification can fail or exhaust quote lifetime before the first provider POST, but was treated as an unknown send. Commit 0b4445821 now returns proven not_submitted before HTTP, checks a final 5-second expiry margin, and recognizes request_expired only from the original provider response with no references. Unknown HTTP outcomes stay reserved. Safe status/code logging excludes signatures and request bodies. Privy official request-expiry documentation establishes request_expired as pre-execution rejection; recovery never replays expired requests to infer historical status.
- Eight BNB/X Layer asset fixtures passed, including final-wallet failure, expiry during wallet verification, original request_expired rejection, unknown/5xx reservation, and no duplicate submission. Focused TypeScript passed. Deploy dep-dbmhhonf3r2c73961ohg started; live status and existing BNB recovery still pending.
- Final production read showed old pending BNB quote expiresAt 1793922895973 and submitting reservation updatedAt 1793922895187: only 786ms remained before the final wallet lookup/provider HTTP call. This supports an expiry race but is not historical proof of a provider rejection. Privy indexed wallet transactions supplied no matching new transaction; absence alone is not proof of failure. Requested original Privy HTTP status/error code for this exact idempotency key. No historical journal mutation or resend.
- Backend 0b4445821 is now live, health and public configuration both HTTP 200 after restart. Native build initially refused HTTP 502 configuration during restart, then restarted after HTTP 200.
- Pixel found another live gap: Close on the uncertain bridge attempted cancellation and left the review open. Native progress now treats dispatch-started cross routes as dismissible while retaining recovery, without claiming a hash or success. Actual Form + Progress browser regression confirms zero cancellation calls, no repeat send, and retained processing record for BNB/X Layer. All 56 directed lifecycle cases and native focused TypeScript passed. New native build pending.
- Final APK pocket-bridge-dismiss-20261106.apk installed successfully; SHA256 67E0099FE6E368115D281EE39743FE3BAA29352DB808E89FDF4EF2BC624B10B7, 1869 packaged assets verified. Source snapshot bridge-dismiss-source-20261106.zip. No new transaction initiated for this installation.
- Post-install Pixel Home retains the uncertain BNB bridge as Processing in Activity, has no Processing badge for the completed Base swap, and does not reopen the old progress sheet. Arc receipt visually verified Completed, Paid with 0.20 EURC, Received 0.20 USDC (rounded display of actual 0.201342), Arc -> Base, fee 0.04 EURC. Screens retry-final-installed and retry-arc-receipt-final.
- The old BNB attempt remains unresolved, not retroactively failed by the fix. Its exact original Privy error is required; indexed absence and expired quote are insufficient proof to release an uncertain reservation. No all-chain live completion claim.

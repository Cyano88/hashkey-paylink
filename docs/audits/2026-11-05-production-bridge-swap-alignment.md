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

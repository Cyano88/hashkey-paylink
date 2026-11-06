# Pocket stock detail and chart audit - 2026-11-06

## Scope and source

Owner approved a dedicated stock detail page replacing the information sheet, with interactive 1D, 5D, 1M, 6M, 1Y and All charts and existing Buy/Sell trade sheets. Reference: newest stock-market image was in Downloads, not Documents. Native source is pocket-play-update-20261101; backend is hashpaylink-recovery-release-20261104. Backend frontend checkout is not the current native source and was not overwritten.

## Implemented

- Dedicated /xstocks/detail?asset=SYMBOL route; exact catalogue asset selection; unknown assets return to Stocks. Existing asset query links redirect to the page. Shared header, palette, typography and amount formatting.
- Current token price, selected-period change, interactive line chart with pointer and keyboard inspection, six range controls, actual coverage dates, holding value/quantity and existing cost-basis return. Muted local currency equivalent when the existing selected currency has a valid FX quote.
- Fixed contextual Buy/Sell actions outside the scrolling content, no bottom navigation on this route. Existing trade review/signing/fees/recovery retained. Opening or changing chart never requests a trade quote. Existing stock result Done callback was unwired; now it calls its supplied onDone, returning to the detail page. Mock purchase completion verified this handoff.
- Back preserves list search and scroll. Closing trade retains the stock/chart range. No dense market-cap dashboard, new wallet, execution provider, portfolio-performance reconstruction or synthetic history added.
- New read-only GET /api/pocket/xstocks/history: catalogue allowlist, exact X Layer contract, six fixed range definitions, signed OKX historical candles. Completed and current candle handling verified against actual provider responses. Validate timestamps/OHLC, sort/deduplicate, bound pagination/queue/cache, share requests, throttle provider calls and back off on 429. Errors do not expose credentials or raw provider responses.
- Existing price, wallet balance and trade endpoints remain the source of their respective data. History is display-only. No private RPC chart reads and no payment sent.
- Long ranges show their actual available date span. 1D/5D are rolling calendar windows for the token, not US-equity trading sessions. Asset details explain the distinction. No underlying-equity feed is silently substituted.

## Verification

- Production authenticated read-only probe: AAPLx/NVDAx intraday and daily history; TSLAx intraday. Provider returned a current unfinished candle and a 429 during the initial burst, motivating parsing and throttling. AAPLx/NVDAx daily histories contained 133/137 records at that time, not a full year. Credentials stayed on Render.
- Backend focused TypeScript passed. History smoke covers signed requests, exact chain/token validation, malformed/future/invalid OHLC rows, sorted deduplication, concurrent request sharing, cache/stale retention, all ranges, paginated annual history, invalid route input/method and provider backoff. Existing market-price smoke passed.
- Native focused TypeScript passed. Stock-detail browser suite covers routing, real chart hook with fixture transport, six ranges, cache and failed-range isolation, keyboard/pointer inspection, fixed actions while scrolling, 320/393/426 light and dark layouts, purchase review and explicit mocked completion, retained timeframe/search/scroll and invalid-asset fallback.
- Existing actual-receipt buy/sell result amounts browser suite passed. Stock quote-idle suite passed after correcting an obsolete six-decimal display expectation to the already accepted two-decimal minimum display; execution formatting was not changed.
- Native source guards passed. Final release build/device and live endpoint checks recorded below when complete.

## Deployment

- Backend f3396d47f3df6e8d7d567c224ac6476cd4d98782 deployed as dep-dbmpkogm7kps73c16ctg, live 09:19:41 UTC; health 200. During deployment the native build correctly stopped at public-config HTTP 502; rerun after health recovery, without bypassing the guard.
- No new real stock purchase/sale, signing or broadcast is part of this audit. Component fixtures do not establish live trade execution or historical coverage for all 808 catalogue entries.

## Final live and Pixel evidence

- All 24 public endpoint checks passed HTTP 200: AAPLx, NVDAx, TSLAx and MSFTx across 1D, 5D, 1M, 6M, 1Y and All. Each returned a nonempty validated series. Daily histories covered available June-November data rather than an invented full year. Live result records are in .codex-temp/stock-history-live-results.json. Initial local Node probes were denied by the sandbox (EACCES); an approved network-enabled rerun passed, independently of curl HTTP 200 verification.
- Signed stock recovery regression passed with the TS loader: intent binding, save-before-broadcast, lost-response recovery, exact replay, throttling, bounded recovery, settlement cleanup and signing/storage failure handling.
- Final Vite/Gradle build passed, including native lineage/config guards; Android build successful. Verified 1869 APK assets against built dist and installed pocket-stock-detail-20261106.apk successfully. SHA256: 374049271295EC3A23F8A2B2643E3E179EA67CFD3D9049A807FE420444F6B257. Pixel only, no public APK rollout. Native manifest: native-release/stock-detail-20261106.json; source archive: native-release/stock-detail-source-20261106.zip.
- Pixel observed Stocks overview -> NVIDIA full detail, real 1D and 5D chart series and corresponding changes, holding values/quantity/PnL, and fixed contextual actions. Initial chart load reserved its space; cached reopening displayed the chart. Evidence: balance-stocks-final-detail-ready.png, balance-stocks-final-detail-5d.png, balance-stocks-final-reopened-detail.png under native output/bridge-swap-audit-20261105.
- Pixel Buy opened the existing opaque Buy NVDAx amount sheet with USDC selected and Continue disabled at zero. Closing returned to the same NVIDIA page. Evidence: balance-stocks-final-buy-verified.png and balance-stocks-final-sheet-return.png. No amount entered, signature requested or real trade sent. One earlier attempted capture landed on Cards; it was not counted as successful handoff evidence, and the open/close test was repeated against the observed stock page.
- Final device left on NVIDIA detail. Broader catalogue history availability (808 entries) and new live buy/sell execution are not claimed by these checks.

## Live follow-up audit (November 6)

- Pixel funding test: Base USDC to X Layer USDC, principal 1.20; first preparation was cancelled before broadcast after fee rechecks (reserved 15462 vs required 18871 units, then fresh fee 217218 above cap 100008). Caps were preserved.
- Retry f02e57af-05c9-4182-82fe-be713ed2ea50: source hash 0x7d5dec6a78cc183371602960ce0776ff1544aaec5c19896a79c43d5a0030d7bf; destination hash 0xe64497462a89286926816aa1574522af22f3448876fa71a67917edf485849185; Relay success and canonical receipt observation 1.178551 USDC. Reimbursement 0.010812; source total 1.210812. Pixel displayed Bridge successful and X Layer purchase balance 1.19 including its preexisting dust. Finalized journal/ledger verification remains to be checked; observation is not final settlement.
- A 1-USDC NVDAx purchase review displayed service fee 0.25% and network fee 0.01 USDC. Submission returned a pre-reservation sponsorship error; no completed stock purchase is claimed yet.
- Verified stock purchases already call quoteSponsoredSwap and the shared configuredXLayerReimbursement estimator, append an exact treasury reimbursement call and validate that payment in the receipt. No duplicate reimbursement path added.
- Backend 988f58e2a distinguishes known expired/increased reimbursement quotes from generic sponsorship outages before reservation. Safe stage/category diagnostics contain no signed requests, credentials or RPC URLs. Unknown/reserved outcomes retain recovery behavior.
- Native follow-up: retain same-owner cost basis on transient reads (exact holding-quantity P/L guard retained); suppress a dispatched request's inline error while reservation recovery determines the bridge result.
- Passed stock detail browser suite, focused native typecheck, bridge panel browser suite across 8 networks/9 asset cases, share basis accounting across 808 stocks, new basis-refresh owner-isolation test, sponsored stock purchase/swap fee and receipt tests, reimbursement and sponsorship suites. These fixture checks are separate from the unfinished live purchase.

### Follow-up results and receipt fixes

- Bridge finalized successfully in the durable journal and published its ledger entry (ledgerPublishedAt 1793960912261). Both Base and X Layer receipts were independently checked as successful and below their finalized block anchors.
- Live NVDAx purchase completed: transaction 0x0f1acdbd874ae67cc11f53835131ef711ece8caa0df0ef3ffa3e06ddc7bc7cc1, sponsorship attempt 3c799def-a7a7-4014-aa5c-95b82a41b623. Receipt shows 1 USDC principal (0.9975 routing + 0.0025 service fee), 0.01 USDC separate reimbursement to treasury, and 0.005263840320913551 NVDAx received. Pixel holdings updated to about 1 USD and cost-basis P/L populated.
- This live test exposed stacked purchase/success sheets and a missing acquired-share amount in the success receipt. The investment component now owns its modal lifecycle so terminal success/failure replaces the input sheet, including legacy trade entry and full stock-detail entry. Removed the redundant delayed-confirmation helper paragraph.
- Execution now retains its verified receipt in a bounded memory cache; success reads the exact received amount synchronously from that evidence rather than waiting for another public RPC request. Uncached recovery still reads a real transaction receipt. No quote is substituted for actual receipt output.
- Stock success receipt details retain Paid with/Received as appropriate, service and reimbursement fees, network, transaction hash and date. The headline acquired/sold quantity is not repeated in the detail rows.
- Browser regression tests verify one dialog after purchase, no underlying purchase contents, buy/sell amounts from the execution receipt with duplicate receipt RPC deliberately unavailable, and correct return to the preserved chart. Focused typecheck passed.
- Backend 988f58e2a deployed live via dep-dbmqkvff3r2c73bd224g at 10:28:28 UTC. First follow-up APK stock-reaudit hash 0AACD0F51ADF01372734F67EF77EE599D4BBC712C9E7B9AAF2100182A2757C6F installed; later single-sheet/receipt APK verification still pending.

### Pixel preset and final purchase verification

- Added the shared 25/50/75/Max keypad to investment buy/sell; removed duplicate Max. Buy Max retains the server fee-aware quote and sell Max retains the exact available shares.
- Pixel exposed ignored percentage taps during quote loading. Removed quote-loading locks from investment amount presets; request-version and input-key checks still reject stale quote responses. Regression delays a quote, changes 25 to 50 to 75, and verifies the final amount survives the old response.
- Second NVDAx purchase was observed completed on the Pixel during the audit, transaction 0x48ea18146baa694410a1d74b899c955f502f867e16d079e490ec1742d81b29d7. Sponsorship principal 166773 USDC units; successful receipt transfers 166356 routing + 416 service fee units and 10000 reimbursement units, with 876008938146066 NVDAx units received. Pixel rounds the principal to 0.17 USDC and fee to 0.01 USDC. No additional trade was submitted by the audit automation in this pass.
- Pixel success and receipt each showed one sheet, actual acquired shares, fee rows, hash and date. Done returned to the chart; holdings updated to approximately 1.17 USD. No claim that every animation frame was captured.
- Pixel sell 25/50/75/Max responded while estimates loaded, but exposed raw 18-decimal amounts clipping the field. Fixed long investment input display with the same shared formatter/threshold as swap, preserving exact raw quantity for quotes, Max and execution. Added an 18-decimal input regression checking formatted display, unchanged exact quantity and no clipping.
- Focused native typecheck and expanded detail browser regression passed. AAPLx 0.10-USDC review from earlier was not submitted; the observed second completed transaction is NVDAx instead.
- Final stock-presets-display APK installed on Pixel; SHA256 4F31DEE1EAFF849508E68D500D50554B17B061A7130E1E0C34572C9982994CBE. All 1869 packaged assets matched current dist. Pixel Max now displays <0.01 NVDAx without clipping; no sale submitted. Source delta archived with relative paths in native-release/stock-presets-display-source-20261106.zip. No public app rollout.

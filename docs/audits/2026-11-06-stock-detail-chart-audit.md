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

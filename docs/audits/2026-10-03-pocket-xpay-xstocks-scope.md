# Pocket XPay / XStocks scope audit and implementation

Date: 2026-10-03. Worktree: `hashpaylink-xpay-20260927`, branch `feature/unified-xpay-20260927`.

## Current agreement

This agreement supersedes the stock-funded bank checkout sections in `XPAY-IMPLEMENTATION.md`. The earlier plan and September 27 session were recovered before implementation.

- Keep one business terminal and QR creator in the existing XPay entry under Stablecoins.
- XStocks opens **Manage XPay** for those same terminals. It can enable, change or remove stock receiving and view stock receipts and quantities received per stock. It cannot create or delete the terminal or edit its bank receiving settings.
- Bank/mobile-money receiving keeps the existing USDC-funded POS route. Supported direct USDC receiving remains available.
- Direct stock payment sends the enabled stock to the merchant's XStocks wallet. Trading received stocks to USDC is a separate merchant action.
- No new stock sale, bridge and bank-payout checkout. Future X Layer USDC off-ramping is deferred.
- Receipt history is separated by asset rail. Stock receipts belong to XStocks; USDC and bank receipts belong to Stablecoins. Totals are per stock, never an addition of different stocks or a live portfolio valuation.

## Source audit and resulting changes

| Area | Result |
| --- | --- |
| Shared creator and manager (`PocketUnifiedXPayPage`, `PocketXStocksPage`) | XStocks home opens Manage XPay; its older no-merchant route redirects there. Existing terminal IDs and QR URLs survive receiving-option changes. Direct merchant checkout routes remain usable. |
| Stock setup (`PocketUnifiedXPaySetup`, `PocketXPayAssetList`) | XStocks setup offers stocks. Existing selected USDC configurations remain readable/editable; the existing Stablecoins setup retains USDC availability. The three-asset limit remains shared across receiving options. |
| Merchant API (`api/pocket/xpay.ts`) | New receiving records require a terminal-issued setup key. Standalone new QR creation is rejected. Existing owner checks, approval, canonical settlement, idempotency and historical records remain intact. USDC receipts are classified as Stablecoins. |
| Unified history (`api/pocket/unified-xpay.ts`, `pocketXPayStockHistory`) | Owner and terminal scoping precede rail filtering. Confirmed stock totals use exact decimal arithmetic and all returned records before the 200-row display limit. Cash, failed/pending receipts and duplicate IDs do not increase stock totals. |
| Public checkout | Bank selection goes to the existing USDC POS route. Stock selection goes to direct stock checkout with the shared terminal reference. |
| Old stock-funded bank API (`api/pocket/xpay-bank.ts`) | New prepare and approve calls return 409. Status and recovery operations remain for already-authorized historical payments. No historical data is deleted. |
| Historical payment recovery (`PocketXPayBankCheckout`) | Server status is reconciled before replaying local transaction evidence. Already-recorded burns no longer trap resumed payout-ready sessions. Failed history retrieval blocks a new prepare until retry succeeds. |
| Historical bridge confirmation (`xpay-bridge-service`) | A provider failure accompanied by a transaction hash is checked against the canonical receipt. An unavailable receipt keeps the same mint attempt pending rather than prompting a duplicate attempt. |
| Stock activity and statements (`PocketStockActivity`, `pocketPurchaseKind`) | Incoming XPay receipts are business activity, not personal purchases. Matching wallet deposits are suppressed to avoid duplicate display; merchant statements use business receipt context. |

The audit covered the shared terminal, setup, scanner/checkout handoff, direct stock payment, receipt classification, statements, POS adapters, and historical stock-to-bank recovery paths. It is a source and fixture-based review, not a claim of a production financial/security certification.

## Validation

- Unified API regressions cover owner isolation, setup ownership, PIN checks, stable terminal IDs, destination revisions, preserved in-flight payments, rail separation and totals beyond 200 receipts.
- Direct stock API regressions cover verified settlement, lost-hash recovery, replay protection, expired quotes, deleted terminals, owner isolation and rejection of standalone creation.
- Browser fixtures cover both themes, XStocks management restrictions, preserving bank configuration and QR identity, stock receipts/totals, business statements, native Back, list scroll restoration and bank checkout handoff.
- Historical bank browser/API, bridge-service and activity regressions cover recovery without duplicate submission, missing-history retry, canonical mint proof and activity classification.
- Changed-file TypeScript semantic/syntax check: zero diagnostics across the 12 changed source files.
- Frontend production build passed; browser screenshots were reviewed under `output/playwright/xpay-stock-history-*.png`.

## Remaining release validation and limits

- No deployment, device installation, real-money payment or live bank payout was performed.
- The former `pocket-ng-pos-settlement-route-smoke.mjs` authentication fixture gap is resolved. It now rejects absent/invalid authentication and missing Basic verification, then checks authenticated settlement, receipt registration and the completed execution. Identity and verification evidence are mocked; production PostgreSQL receipt persistence is not exercised. The POS settlement route itself is unchanged.
- A full-repository TypeScript check did not complete; the focused changed-file check did. Do not treat this as full-repository test certification.
- Existing mixed USDC/stock destination records are retained; this work does not migrate production receiving records or redesign Stablecoins checkout.
- A fixed-amount terminal experience and future X Layer cash off-ramp are outside this scope.

Before release, exercise the actual authenticated merchant/payer flow on a device, including a stock receipt and the existing USDC-funded bank route, using the normal release process.

## Native release preparation

- Native web build passed with verified public authentication and Android push configuration.
- Capacitor Android sync and Gradle `assembleDebug` passed.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk` (40,245,892 bytes), rebuilt with the navigation and balance-card changes below.
- SHA256: `FACCCE88273E737DF49BC346B0B6669CD44EAF63F4B0EAD146FAA9C14236FAE3`.
- The Pixel was connected during preparation. No APK installation, data clear or live transaction occurred.
- This is a debug device-validation package, not a signed store release. Deploy the matching backend before validating the new receipt totals on the device.
- Tracked hosted `dist` files were restored after native assets were copied into the Android project, so the native build does not replace the checked-in hosted build.

## Navigation follow-up

- The XStocks bottom navigation now has XPay using the exact shared Stablecoins Store icon. It opens the shared manager with XStocks origin and highlights XPay while managing terminals.
- The former home XPay shortcut is Swap at `/xstocks/swap`. Its From/To selectors use the existing supported stocks, native OKB and USDC catalogue and executable-quote validation.
- Trade is now Buy / Sell at the existing `/xstocks/trade` path. Buy spends USDC; Sell receives USDC. The Swap tab is removed from this screen; the separate Swap screen has no Buy/Sell tabs.
- Stocks remain discoverable through Home > Stocks > View all and Portfolio. Existing stock Buy/Sell links remain valid.
- Browser fixtures passed in both themes for routing, identical XPay icons, stock-origin preservation, USDC Buy/Sell, OKB/stock selection, and blocking an unavailable swap quote. Existing XPay management and navigation regressions passed.
- Focused TypeScript checks passed for all seven navigation/trade source files. Native web build, Capacitor sync and Android debug build passed after these changes.

## Approved balance card

- Implemented the approved compact layout, matching the existing Stablecoins card geometry without modifying that card. No X Layer pill.
- Headline Total value is the USD valuation of USDC, stocks and native OKB. The lower label cycles Spendable (USDC) > Stocks invested (USD) > Transaction fees (OKB), displaying one balance at a time.
- Unknown balances or missing required prices do not become zero or a partial headline total. Known empty holdings need no market price. Existing stale-price and wallet visibility behavior is retained.
- Native OKB market pricing is included in the server allowlist using the existing provider's native-token identifier. This backend update must accompany the client release.
- Calculation and price-route fixtures passed, including missing quotes, incomplete snapshots, zero holdings and non-par USDC valuation.
- Browser comparisons against the real Stablecoins page passed exact width and height equality at 320, 390 and 430px in light/dark themes. Balance cycling does not resize the card; both amounts hide together.
- Changed-file TypeScript checks, native web build, Capacitor sync and Gradle debug build passed. No deployment or installation occurred.

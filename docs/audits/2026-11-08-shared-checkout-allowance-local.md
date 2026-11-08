# Shared checkout allowance and native handoff - 2026-11-08

## Agreed policy
Fixed USD 7,000 daily checkout allowance after Basic verification, shared by the authenticated Pocket identity across Cash balance and supported stablecoin wallet checkout networks. Existing Pocket verification is reused. Ordinary Pocket bank-transfer tier policy is unchanged.
The earlier live read returned 6,992 USDC provider capacity and an unset advanced daily NGN setting. The user explicitly chose the fixed checkout policy after that distinction was explained.

## Enforcement
- Existing owner-keyed checkout-buyer ledger is retained, including earlier cash reservations. Wallet payments use namespaced internal ledger references; no synthetic provider orders are created.
- Basic verification is checked server-side before checkout payment. Circle EVM proves the Circle session and linked Pocket wallet; Solana builds require authenticated Pocket ownership; BNB reserves before dispatch; X Layer reserves during authorization.
- One atomic ledger covers cash, USDC, USDT, USDe and USDG across the eight supported networks. Amounts are counted in USD stablecoin units; sub-micro amounts round up. Existing reservations count once on retry, including after midnight. Daily boundaries are Lagos time.
- Confirmed bank refunds restore allowance. Unknown outcomes retain reservations. Wallet reservations are not incorrectly reconciled as provider orders.
- Bank capacity is checked while preparing payment, using the existing five-minute cache and in-flight deduplication. Bank execution rechecks the order and daily allowance without another capacity probe. Stablecoin-only payments do not query bank capacity.
- First-time Basic verification errors propagate to the checkout panel/native prompt, even if receipt emails are disabled.

## Handoff/UI
- Cash has no change-network CTA, including the backend navigation response.
- Cash and Stablecoins each offer explicit app or web continuation. App handoff never silently chooses web payment, including when a cash route is already selected.
- Native cash handoff preserves the selected method as a presentation hint; the server still determines available methods and binds the payer.
- Android uses the native intent with a browser fallback. Desktop shows the checkout QR and Get Pocket. The exact authorized internal-testing URL is allowlisted and supplied when no Play URL override is set.

## Verification before deployment
Passed: web TypeScript; web source build; native source guard and source build; Capacitor sync; Gradle assembleDebug; adb install -r on the connected Pixel (data retained).
Passed fixtures: fixed shared cap, all eight networks, concurrent cash/stablecoin spending, exact-boundary spending, USDT, Basic gate, retry binding, refunds and daily reset; wallet payment during provider outage; no capacity probe during execution; BNB allowance rejection prevents broadcast; receipt ownership; historical settlement signatures and route locks; mobile/desktop Basic verification; Cash app-only handoff and exact Play fallback; no transaction writes from app/download selection.
No live funds sent. Live deployment and Pixel observations will be appended after completion. Installing the debug APK does not publish a Google Play release.

## Workspaces
Web: C:/Users/USER/hashpaylink-recovery-release-20261104.
Native: C:/Users/USER/pocket-play-update-20261101; targeted edits only, distinct source lineage.

## Deployment and final acceptance
Render deployment dep-dbo45ebrjlhs73ac8r60 is live at 06d4339163c2a1a1db0c3dfd7f9aebac5e21ca27. Final web build and inline verification regression passed. Cash entry regression passed outside sandbox after dependency directory access was denied inside it.
Live Lunchroom checkout exposed Stablecoins and Cash balance. Fresh cash fallback showed Get Pocket with the exact authorized Android test URL, explicit Pay on web, and no change-network action. Public checkout config returned the same download URL.
Final native source guard, build, Capacitor sync, Gradle and adb install -r passed. Pixel first reached the review screen during deployment restart and showed temporarily unavailable. Subsequent observation showed another app in foreground, so final native cash review remains unverified. No live payment was sent; no Play release was published.


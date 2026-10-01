# Pocket Stablecoins audit — 2026-10-01

## Scope and release position

Audit of the current Stablecoins UI, native navigation, payment state handling, wallet-session recovery, gifts, bills, bank payout, requests, receipts, notifications and KYC boundaries. No new real payment, gift funding, claim, refund or identity submission was performed. Existing user data must remain intact.

This is a verified regression pass, not an App Store readiness certification. Statements and Support refinement remain the next separate product pass.

## Confirmed fixes

- Native Back was registered inside CirclePocketApp only. Gift sibling routes did not receive it. On Pixel, Back changed the underlying gift route while its share sheet stayed open. Registration now lives at the native host boundary.
- Native Back now follows the visible flow header's callback after overlays have handled it. Busy sheets and provider dialogs prevent navigation underneath.
- Dropdowns consume Back before page navigation. The regression test exposed that dispatching directly on window did not provide the intended capture priority; dispatch now originates at document and bubbles to window.
- Profile, Arc token picker and email-code handlers respect consumed events and topmost dialogs.
- Restoring a Circle session omitted its existing Arc mainnet wallet from the active session cache. The cache now includes it, bound to the same owner and address. A fixture verifies wrong-owner/address isolation. This does not prove any existing unresolved bridge completed.
- An Activity bridge marked Needs attention opened an intermediate Processing sheet. Non-receipt entries now open their details directly and show the recorded status. Bridge/swap titles describe the movement accurately. Existing full receipts are unchanged.

## Verification

- Sequential `npm run test:pocket-release`: 23 bounded suites passed. Covers authentication/security, ownership, ledger/execution/reconciliation, provider boundaries, requests, balances/activity, bank/POS/bills, money push, support lifecycle, router and storage security.
- Initial browser matrix: 35 of 45 passed. Five additional failures were resolved by correcting outdated fixture expectations/dependencies: bills refund sheet, launch handle, transaction-sheet amount/style, balance refresh asset path, and the current unified XPay setup fixture. These were test problems, not five additional production fixes.
- Dedicated native Back regression passed: selector, sheet, busy sheet, provider dialog, header step, history fallback and Home minimize.
- Dedicated Activity details regression passed: Needs attention remains truthful, recovery action is directly available, no fabricated Processing/success.
- Wallet-readiness/restored-Arc regression passed.
- Additional bridge recovery, proof, journal, activity, network coverage, send-attempt journal and receipt-policy suites passed.
- KYC identity/privacy, guidance, transfer allowances, v3 callback/authentication and bank-entry boundary suites passed. The bundled KYC fixtures must run with plain Node; adding the tsx loader changes their CommonJS import shape. The bank-entry fixture now stubs the unrelated live exchange-rate display hook.
- Changed-code TypeScript diagnostics: zero.

## Test debt and remaining evidence gaps

Historical source-text assertions in circle-pocket-contracts-smoke are retained behind POCKET_LEGACY_SOURCE_ASSERTIONS=1. They require retired UI labels, old component paths and four-network assumptions. They are not evidence that the current UI is correct. Current executable tests and the above browser checks provide the recorded coverage; this opt-in legacy block is not currently passing.

The older verification-navigation fixture imports removed name-verification components. Durable-activity, activity-layout and terminal export browser fixtures need updating to current wallet/profile data and statement controls. The old unified-send browser fixture targets XStocks and is outside this Stablecoins pass. Do not describe all historical browser tests as passing.

A saved Arc bridge on the Pixel still has a challenge ID without a recovered transaction hash. Read-only Check status produced no captured getChallenge/getTransaction request in the observation window. No success was inferred, and unrelated wallet rows were not collapsed by amount/time. Recheck authenticated recovery after installation; otherwise this remains an unresolved item.

Uganda verification prompt wording needs a separate country-aware UI check; no KYC permissions or limits were loosened in this audit.

Still required before a public-store readiness claim: current-device acceptance after install, live settlement/recovery evidence for relevant rails, release signing/store configuration and iOS-specific validation. Do not confuse existing provider access or passing mocks with this evidence.

## Delivery

Build/device/deployment results will be appended after verification. Unrelated XPAY-IMPLEMENTATION.md changes are preserved.

### Verified delivery evidence

- Android debug build: BUILD SUCCESSFUL (366 tasks); installed with adb install -r, Success. No uninstall or data clear.
- Pixel physical Back check after install: gift share sheet closes while Your gifts remains open; second Back opens Send a gift; third Back returns to Send. Verified via Android keyevent 4 and WebView route/dialog state. No bearer gift contents logged.
- Mobile Vite output reports built in 3m 14s. The PowerShell invocation reported exit 1 alongside Rollup dependency/chunk warnings; compiled assets were produced, synced, built by Gradle and exercised on Pixel. Do not describe the shell build exit as zero.
- Web deployment has not yet been verified.

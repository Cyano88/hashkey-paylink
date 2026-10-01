# Pocket Stablecoins audit � 2026-10-01

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

Before installation, a saved Arc bridge on Pixel had only a challenge ID and Needs attention. After installation and normal authenticated loading, it recovered automatically: source and destination hashes present, sourceConfirmed true, historySynced true, progress completed. The durable Activity snapshot contains the completed wallet-bridge with the exact source hash and a confirmed deposit with the exact destination hash. The installed Activity entry opens USDC bridge details directly with Done. No new transfer was submitted; no amount/time matching was used.

Uganda verification prompt wording needs a separate country-aware UI check; no KYC permissions or limits were loosened in this audit.

Still required before a public-store readiness claim: broader current-device acceptance across all flows, live settlement/recovery evidence for remaining rails, release signing/store configuration and iOS-specific validation. Do not confuse existing provider access or passing mocks with this evidence.

## Delivery

Build/device/deployment results will be appended after verification. Unrelated XPAY-IMPLEMENTATION.md changes are preserved.

### Verified delivery evidence

- Android debug build: BUILD SUCCESSFUL (366 tasks); installed with adb install -r, Success. No uninstall or data clear.
- Pixel physical Back check after install: gift share sheet closes while Your gifts remains open; second Back opens Send a gift; third Back returns to Send. Verified via Android keyevent 4 and WebView route/dialog state. No bearer gift contents logged.
- Mobile Vite output reports built in 3m 14s. The PowerShell invocation reported exit 1 alongside Rollup dependency/chunk warnings; compiled assets were produced, synced, built by Gradle and exercised on Pixel. Do not describe the shell build exit as zero.
- Web deployment verified live: dep-davasijtqb8s73f4jnk0, commit 27f80b3cfa260b4176c498a6066312f612853b50. Pocket web returned HTTP 200 after rollout. Two independent XStocks Agreement commits were merged without conflicts before push; no Stablecoins overlap.
- Pixel contains the audited Stablecoins changes at af74ede8e. The later merge only adds the independent XStocks Agreement work; it was not rebuilt into this Pixel APK.

## Follow-up: keyboard and approval recovery

- Pixel Send USDC: amount input opens the Android keyboard; first physical Back dismisses it without leaving the form. Network selector closes on Back without leaving Send; next Back returns to Send menu.
- Pixel bank amount screen: keyboard viewport measured 618.33 CSS px, Continue remains visible, no horizontal overflow. First Back dismisses keyboard and keeps Enter amount; next Back returns to Bank transfer. A temporary input of 1 was cleared; no quote approval or payment was submitted.
- Found native keyboard subscription cleanup race: four delayed registrations survived route unmount. Reproduced in a new regression fixture before fix. Each registration now removes itself if it resolves after disposal, and individual registration failures no longer strand successfully registered handlers.
- New keyboard lifecycle regression passes: focus, late registration cleanup, remount, show/hide and zero retained listeners. Native Back regression also passes.
- Approval recovery, Circle approval surface and background recovery fixtures pass: provider close, timeout, errors, offline, cancellation, late callbacks, receipt-driven completion, anchored Confirm, account-switch isolation and quiet EVM/Solana recovery. These are mocked-provider tests; they are not a newly submitted live payment.

### Next statement scope proposed to user

One shared statement design, scoped to its entry point. Main Activity defaults to all balance movements with optional Bank transfers & bills filter; terminal/collection exports remain scoped; XStocks stays separate. DD-MM-YY dates; + or - on amounts rather than redundant direction labels/arrows; USDC primary with actual NGN/UGX local payment amount below. Remove provider/internal-routing jargon. Preserve truthful status, grouped funding/fees and financial totals. Date range, PDF default, CSV option. This is a product presentation proposal, not a conclusion about regulatory obligations.

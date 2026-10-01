# Pocket Stablecoins audit ï¿½ 2026-10-01

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

### Follow-up delivery verified

- Vite reports built in 4m 3s; Android Gradle BUILD SUCCESSFUL in 17s. Pixel install -r returned Success, with no data clear. Rechecked Send USDC keyboard dismissal after installation and returned Pixel to Home.
- Changed-code TypeScript diagnostic check reports zero. Circle handoff, delayed status presentation and Bills navigation fixtures also passed.
- Web deployment dep-davb6onf3r2c739q00pg verified live at commit 2aa3017fb45cc256464f3458b7f03376517e91b3; Pocket web HTTP 200. Concurrent Trade proposal-editor changes were merged without Stablecoins overlap. Pixel contains the keyboard fix at 222df2fc9; later unrelated Trade merge was not rebuilt into this APK.
- Statement audit finding for the next pass: exportStatement currently exports `visible`, already narrowed by Activity category/status/date filters. The download date range cannot expand those rows. The new export scope must be explicit and independent of hidden list filters while respecting terminal/collection ownership.

## Statement simplification — implemented

- Shared PDF/CSV presentation uses DD-MM-YY dates, signed amounts, clear transaction descriptions and readable statuses. PDF shows recorded NGN/UGX amounts beneath the primary asset amount. Provider-routing strings, transaction hashes, network labels and internal references are omitted from the statement body.
- Full available personal activity is the default. Optional Bank transfers & bills scope is available on Stablecoins. XStocks, merchant and collection exports retain their existing scoped row sources. Collection export headings no longer expose collection IDs.
- Download dates and scope are independent of Activity category/status/date filters and archived-list presentation. Funding-only rows remain excluded; no exchange rate is invented for local equivalents.
- PDF is default. CSV preserves exact signed decimal amounts as numeric-safe cells, and protects user-controlled text from spreadsheet formula injection.
- Data regressions pass for CSV escaping, statuses, local-date inclusivity, invalid ranges, unpaid-request and merchant isolation, collection scope, local-rail filtering and funding exclusion.
- Browser export regression passes when the visible Activity list is empty because of a future-date filter: All activity still exports recorded rows; local scope excludes deposits and gifts. PDF default is asserted.
- Two-page fixture PDF rendered with the production Jakarta and Naira fonts and inspected locally. Verified long recipient wrapping, page break/header/footer alignment, double-stroke Naira, UGX amounts and preservation of 0.00000001 USDC. No real user data was used in the PDF fixture.
- Changed-code TypeScript diagnostics: zero. Pixel save/return and live deployment verification pending.

### Statement delivery checkpoint

- Mobile Vite built in 2m 41s; Gradle BUILD SUCCESSFUL in 16s. Pixel install -r returned Success with data preserved.
- On the installed app, Download statement opened with PDF and All activity selected. A one-day PDF export was requested without logging transaction contents.
- Native save/return is NOT yet verified: the phone switched to another app during the check; Pocket process remained alive. Asked user to leave Pocket open before continuing. No restart claim is made from this interrupted test.
- Statement changes pushed as 80b3a85e6; Render dep-davbicjtqb8s73f5nfe0 was updating at this checkpoint. A subsequent independent Trade merge retains the statement commit.
- Final web verification: dep-davbicjtqb8s73f5nfe0 is live at 80b3a85e6 and Pocket web returned HTTP 200. Subsequent Trade-only deployment is separate and retains this work.

### Native statement save acceptance — passed

- Repeated the real Pixel PDF export through Android Documents UI. Validated the Save control against the current foreground picker before tapping it; did not reuse coordinates while another app was foreground.
- After Save: /activity unchanged; window acceptance marker and performance.timeOrigin unchanged; download sheet closed; no dialogs remained. Pocket PID remained 30358 throughout. This confirms successful completion without WebView reload or process restart.
- Saved file: Downloads/pocket-statement-2026-10-01-2026-10-01.pdf, 198983 bytes. PDF header verified. No transaction contents were copied or logged.
- Earlier cancelled/interrupted attempts are not counted as successful. Native PDF save-and-return check is now complete. CSV content/download path was verified in the browser regression; no claim is made of a separate native CSV save test.

### Compact statement and reference column

- PDF now uses a 12-row compact table with Date, Description, Reference, Status and Amount; repeats account identity, period, summary and column headings on each page. Actual local amounts stay beneath USDC amounts.
- Reference mapping is shared with existing receipts, preserving their identifiers rather than inventing export IDs. CSV includes the same full reference. References wrap in PDF.
- Confirmed USDC summary uses exact integer arithmetic; excludes failed/pending/refunded records, internal funding, bridges/swaps and other assets. Does not infer opening, closing or running balances.
- Account header uses the current authenticated profile with an email ownership guard. Missing identity is omitted rather than borrowed from another session.
- Data tests passed for reference parity and exact totals, existing statement/collection scope and formula safety. Browser export regression passed. Two-page synthetic PDF rendered and both pages visually inspected. Changed-code TypeScript diagnostics zero.
- Build, deployment and Pixel installation verification follow below.

- Compact statement delivery: Vite completed in 2m 7s, Capacitor sync passed, Gradle BUILD SUCCESSFUL in 14s. Pixel install -r returned Success. App runtime available after update; user was on bank confirmation, so no further navigation or payment interaction was performed. Native save code is unchanged from the previously passed acceptance check.
- Pushed merge 359318aff preserving independent XStocks backend updates. Render dep-davc38eq1p3s73d49a50 pending live verification at this checkpoint.

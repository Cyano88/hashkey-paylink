# Pocket mobile UX review â€” 2026-09-16

## Scope and evidence

Reviewed the existing source and the installed Android app on a connected Pixel 10 Pro. Installed package: `com.hashpaylink.pocket`, versionName 1.0, versionCode 1, last updated August 20, 2026. This installed bundle differs from the current local source. No app reinstall, credential change, sign-out, payment authorization, or funds movement was performed. Existing repository changes were preserved.

Device observations cover Home, Send, recipient numeric keyboard, Profile, Bills, and the current Swap screen. This is not a completed end-to-end transaction or iOS audit. Local screenshots remain in `.codex-temp`; they contain account information and should not be published or committed.

## Preserve existing mobile work

- Keep the current visual identity, large action buttons, bottom navigation, and Pocket ID transfer entry.
- Home, Send, Profile and Bills fit the tested Android viewport without visible horizontal clipping.
- Recipient entry opens a numeric keyboard and hides bottom navigation. Android Back dismisses the keyboard.
- Source already implements native safe-area insets, keyboard events, deep links, resume refresh, pull-to-refresh, payment PIN/biometric integration, and secure session storage. These should not be rebuilt as if absent.
- Pocket uses Capacitor with Privy email authentication and Circle's web wallet SDK. A native Circle adapter would replace wallet SDK operations, not the whole mobile interface.

## Findings worth addressing

### 1. Arc availability is inconsistent â€” high priority

The installed Home displays Arc as Soon. This remains in current `src/pocket/pages/PocketHomePage.tsx`: Arc has `soon: true` and the network button is disabled. Meanwhile current `PocketSwapPage.tsx` exposes Bridge USDC and Swap on Arc. Tie availability to verified mainnet readiness across Home, Send and Swap. Do not simply remove the gate without validating the rail.

### 2. Complete the non-USDC token journey â€” high priority

Current `PocketSendPage.tsx` remains Send USDC, with USDC amount and balance presentation. Home also presents USDC totals. The new Arc swap panel can receive other supported tokens, but that does not constitute a complete token portfolio and Pocket-to-Pocket token transfer flow. Add supported-token holdings, token selection for Arc sends, recipient/network confirmation, and token-aware activity/receipts before advertising this capability. Avoid calling a USDC-only sum the value of every held asset.

### 3. Make bridge recovery explicit â€” high priority

`usePocketBridgeController.ts` holds its active state in component memory and polls 36 times at five-second intervals. A failed submitted-record request returns from polling silently; a non-terminal result after the polling window has no explicit next recovery action in the bridge panel. The backend reconciliation worker exists, but the bridge screen needs to recover the durable execution on reopening and show pending status, a status-check action, and a receipt/support reference. Changing screens must not invite a duplicate submission.

The new Arc swap panel has pending-state recovery, but switching from Swap to Bridge unmounts the panel during an approval. Review mode-switch/navigation behavior during signing as part of the same work.

### 4. Do not hide wallet-link errors â€” high priority

`ensurePocketWallet` in `usePocketWalletController.ts` catches failed backend wallet linking and still returns a wallet as ready. Surface a recoverable setup error and retry linking; otherwise the UI can look ready while backend reads or transfers cannot find the wallet.

### 5. Clarify unavailable features â€” medium priority

Bills is a primary navigation destination, but the installed app displays "Bills pilot is not open" followed by internal provider/refund-control language. Current source retains this copy in `PocketBillsPanel.tsx`. Keep operational gates, use plain availability messaging, and decide whether an unavailable service deserves a permanent primary tab during the pilot.

### 6. Distinguish bridging from swapping â€” medium priority

The installed app calls its network-to-network USDC bridge "Swap USDC". Local source already improves this to Bridge & swap with separate modes. Ship and verify the updated flow as part of a versioned mobile build. Short network labels below the Home icons would also make selection clearer to users unfamiliar with chain logos.

### 7. Finish native back behavior for email verification â€” source finding

`PocketEmailLogin.tsx` renders its OTP screen as a portal but does not intercept `POCKET_NATIVE_BACK_EVENT`. `CirclePocketApp.tsx` minimizes the app when Back is pressed on the landing route. Add a modal-level Back handler so it returns to email entry first. This path was not exercised on the signed-in phone.

## Recommended order

1. Preserve the current design and fix wallet readiness, bridge recovery, and inconsistent availability.
2. Complete the Arc token holdings/send/receipt experience alongside swaps.
3. Introduce native Circle SDK adapters behind the existing wallet controller, preserving account and wallet identity.
4. Produce a versioned candidate build and validate Android and iOS: fresh sign-in, OTP Back/resend, session expiry, biometric cancellation, keyboard scrolling, background/kill during approval, reconnect, delayed confirmation, and accessibility/text scaling.

No conclusion about mainnet transaction success, iOS behavior, or native SDK reliability can be drawn from this read-only UX review.

## Implementation follow-up — 2026-09-16

Implemented locally after the review:

- Wallet linking failures now reject setup for EVM and Solana, rather than returning a ready wallet.
- Home includes Arc in the existing network selector, labels all network icons, and calls its USDC-only sum Total USDC. This enables balance selection; it does not prove a mainnet transaction succeeded.
- The email OTP screen handles native Back before the landing route minimizes the app.
- Bills retains its availability gate and now uses customer-facing copy.
- Bridge recovery persists an account-scoped reference before wallet execution/broadcast, restores pending state, reads owner-scoped pending records from the backend, retries status/history checks, and offers an explicit status action. Stale quote responses cannot replace a newer quote.
- Persisting recovery state is mandatory before signing/submission. Pre-submission failures do not create a pending record. Unknown outcomes remain blocked; a provider-confirmed EVM challenge failure with no transaction can release the block.
- Bridge journal retries retain terminal state and stable timestamps, preventing stale submitted retries from downgrading completed records or creating new ledger events for the same transition.
- Bridge and swap panels stay mounted across mode changes. PIN/approval and signing states block tab, header and Android Back navigation.
- No credentials, production settings, installed application, native SDK dependencies, or customer funds were changed.

Validation:

- Pocket mobile Vite production build passed; existing chunk-size and dependency annotation warnings remain.
- Added `npm run test:pocket-mobile-recovery`: failed wallet-link readiness; persistent recovery and account isolation; owner-scoped recovery response; journal retry/terminal-state preservation; and persistence-before-Solana-submission tests.
- Existing bridge adapter, wallet-link adapter, EVM topology, reconciliation-worker and payment-security smoke tests passed.
- Full repository TypeScript check failed outside this change as well: PolyStream typing, missing lucide-react declarations, bills resetResult, biometric option typing, deposit network typing and bank liquidity typing. The touched approval label nullability was corrected. The default ES2020 library setting also rejects existing Array.at usage in the ledger dependency.

Remaining work and limits:

- The updated build has not been installed or tested on Android/iOS. Native SDK integration is still pending.
- Non-USDC token holdings, Pocket-ID transfers and token-aware receipts remain a separate implementation milestone. USDC totals are now labeled accurately.
- Recovery of a submitted hash can use backend records. An EVM challenge or ambiguous Solana submission without a returned hash still relies on the local reference; clearing app data during that window requires support reconciliation. Cross-device pre-hash recovery is not complete.
- The bridge record API still needs a separate ownership/amount/destination proof audit against chain/Circle data before public release; this UX follow-up does not certify its accounting trust boundary.
- The previously identified server payment-approval header and PIN-reset freshness issues still require security fixes. Passing the existing payment-security smoke tests does not establish those issues are resolved.
- Device kill/reopen during signing, session expiry, cancellation, offline recovery, iOS and accessibility tests remain release gates.

Final verification: the mobile build passed again (1m 7s), the final controller/page transpile passed, and targeted bridge/swap API typechecking passed with ES2022 library definitions to match the supported Node runtime. Repository-wide typechecking remains failing under its current configuration. git diff --check passed for the reviewed changes.

## Activity-owned bridge flow — 2026-09-16

This supersedes the earlier single-pending-bridge UI and account-wide bridge blocking described above.

- The bridge form clears after a source transaction hash is returned and stored. Destination arrival never holds the form open. The short submission message links to Activity; there is no permanent pending card.
- Activity combines device recovery references and backend history into one expandable row per bridge. Multiple transfers can remain in flight independently. Source burn entries are deduplicated against their bridge row.
- Provider status refreshes while Activity is visible. Details show Sent, Arriving and Completed. Submitted is retained until source confirmation is known. Completion requires Circle forwarding confirmation, not attestation alone.
- A provider-confirmed source failure offers New bridge with a fresh quote. Forwarding failures show Needs attention; they do not imply a refund or offer to repeat the source debit. Status-service outages preserve the previous state.
- Duplicate protection is per attempt: the active submission is locked; EVM Circle execution receives a stable attempt idempotency key; only the same amount/route with an unknown pre-hash result requires a status check before repeating. An arriving transfer with a known source hash does not block another bridge.
- Storage migrates the earlier single pending reference into per-transfer history without losing it. Ambiguous pre-hash recovery still depends on the device reference, as noted in the limitations above.

Verification: multiple-transfer storage, account isolation, legacy migration, duplicate guards, terminal-state preservation, Activity deduplication, provider status classification, bridge API, Activity API and reconciliation tests pass. A 390x844 Playwright fixture using the actual Activity component and recovery hook verified compact rows, expansion, live arrival, source-failure action and status-outage handling. Fixture data only; no live funds moved. Screenshots are under output/playwright. Native device installation and live mainnet end-to-end testing remain pending.

The mobile production build passes with existing bundle-size warnings. Broader API typechecking through Activity still encounters existing Paycrest and bills-store dependency errors; it is not a clean repository-wide typecheck.

## Android candidate installation — 2026-09-16

- Built Pocket 1.0.1 (versionCode 2): signed release APK and debug APK both passed Gradle packaging.
- Updated the connected Android device with the matching debug APK via adb install -r; installation succeeded without clearing application data. Package version and launch status were verified.
- Signed candidate: android/app/build/outputs/apk/release/app-release.apk. Device candidate: android/app/build/outputs/apk/debug/app-debug.apk.
- All five test:pocket-mobile-recovery suites passed for this candidate.
- Updated stale contract assertions for wallet-link error propagation, the current Plus Jakarta Sans font, Activity-owned bridge submission, and the Home Arc selector.
- The broader release gate still fails in test:pocket-contracts on an older key: arc / comingSoon: true expectation elsewhere. It is not a clean release gate.
- No Render deployment or store publication occurred. Backend changes remain local; the installed frontend does not establish full end-to-end bridge recovery on the live backend. The payment-security, bridge accounting proof and device recovery gates above remain open.

## Arc swap picker and automatic prices — 2026-09-16

- Preserved the current Pocket tap-to-confirm CTA and PIN/device approval flow. PocketSlideAction is a legacy component name; its rendered control is a button, not a slider.
- Removed the separate Get quote button, duplicate heading and permanently displayed destination contract. Output token starts unselected.
- Valid Arc token pair plus amount fetches a quote after a 500ms debounce. Old responses cannot replace newer inputs. Quotes refresh at expiry while the swap view is active; approval/signing freezes refresh. Quoting does not open wallet approval.
- From/To open a compact token sheet with held tokens first, an expandable search field, name/symbol/address matching and provider-backed Arc contract discovery. It does not claim a popularity ranking. Unsupported or mismatched-chain/address provider results are rejected. Discovered tokens still require validated Arc-only swap routes.
- Catalog API retains all supported tokens even when balance lookup is limited to 50. Unknown balances remain unknown rather than zero.
- The live API route error is a deployment mismatch: server.ts registers the local arc-swap handler, but those backend files have not been deployed. Client copy now reports unavailability without exposing the router error. No Render deployment occurred in this follow-up.
- Arc swap/provider regression tests passed, including wrong-chain/address discovery rejection and exact route validation for a discovered token. Vite mobile compilation passed. A 390x844 fixture verified a single Confirm swap button, automatic quotes without wallet prompts, expiry refresh, contract lookup, and rejection of stale quotes after rapid amount edits. Screenshots and fixture are under output/playwright. No live swap was executed; this follow-up is not installed on the device yet.

## Own-wallet approval policy — 2026-09-16

User decision: own-wallet swaps and bridges follow the same confirm-button flow without an additional Pocket payment PIN or biometric prompt. Sends, payments and withdrawals retain their existing Pocket approval requirement. Circle signing remains required where the wallet provider requests it.

Implemented the UI and server exception for Arc swaps, EVM own-wallet bridges and a dedicated Solana own-wallet bridge signing action. Login authentication is passed independently of Pocket approval tokens. Solana bridge prepare, signing and submit validate linked destination ownership, and signing validates the exact CCTP transaction before creating a Circle challenge. Arbitrary Solana payment signing is not exempt.

Validation: Arc route/quote tests, five mobile recovery suites, payment-security smoke test and Solana CCTP relay tests passed. Added checks that external Solana destinations are rejected before preparation or relay. UI compilation passed. Broader backend typechecking still reports existing dependency/type issues including missing bn.js declarations. Changes remain local; no backend deployment or new phone installation performed for this policy update.

## Release hardening and 1.0.2 candidate — 2026-09-16

- PIN recovery now checks Privy's verified session ID and server-fetched latest email verification timestamp. A refreshed access token in the same session or a different old session cannot reset the PIN. Existing reset tokens without the new verification metadata fail closed and must be restarted.
- Outgoing payments from an account with a configured Pocket PIN require payment approval even if the caller omits X-Pocket-Client. Own-wallet bridge actions retain the explicitly approved exemption. A linked Pocket account using another frontend must still provide its payment approval for outgoing money movement.
- Bridge record writes now require a completed Circle source message matching linked source wallet, linked destination wallet/ATA, source and destination domains, native USDC token and net quoted amount. A client-supplied hash/amount alone cannot create a journal or ledger record. While Circle proof is not yet available, the device retains its reference and Activity retries synchronization.
- New tests cover renewed-token reset rejection, stale-session reset rejection, omitted-header approval enforcement, own-wallet exceptions, EVM/Solana bridge message validation, and rejection before journal/ledger writes.
- Updated stale release assertions to match current Arc mainnet wallet behavior, shared email copy and expandable bridge Activity rows; retained explicit rejection of old Arc testnet wallets.
- Render service was identified as Hash PayLink on branch main. Subsequent configuration and SSH verification encountered DNS resolution failures. No deploy, secret change, production transaction, or phone upgrade was performed during this release-hardening step.

## Release candidate verification - 2026-09-16

All 23 bounded Pocket release suites passed across the resumed runs, including the corrected mainnet balance/load fixtures. The final load, bridge source-proof, payment approval/PIN recovery, Arc swap/mainnet, and mobile recovery checks passed. Repository-wide TypeScript remains limited by the previously documented dependency/type errors.

Render's existing live rollback reference is commit 32cecfc5c976ef95d335584bae1427c1c8bd0247 (deploy dep-dadkdebbc2fs73bljqcg). The service now has explicit Arc mainnet RPC settings and a dedicated server-only swap quote secret. Secret values are not stored in this report. The mainnet deployment template no longer requests a Circle test API key.

Android 1.0.2 (versionCode 3) signed release packaging succeeded. Installation of the matching debug update is sequenced after backend deployment. No funded bridge/swap, store publication, or complete physical-device recovery drill is claimed by these checks.

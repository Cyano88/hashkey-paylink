# XPay shared checkout audit and implementation scope — 2026-11-16

## Accepted product structure
One merchant QR opens the shared payment journey. Pocket is preferred; a web checkout remains available. A single Open Pocket action offers Get Pocket only after an unsuccessful handoff. The merchant identity and payment context remain visible. Creator acceptance, payer funding source and merchant settlement are separate concepts.

Reusable terminals accept a customer-entered amount; fixed orders bind their amount and currency to a server-created payment session. Each payment gets an independent session: a reusable QR is not itself a paid order. Supported configured methods are selectable; future methods are disabled. Existing terminal URLs and historical payment recovery must survive migration.

## Verified current gaps
- Unified XPay stores terminal identity, owned destination IDs, destination revisions and setup keys. Public reads revalidate the destination revision; payment adapters revalidate the destination before paying. Preserve these checks.
- Stablecoin receiving currently binds Circle-owned wallets on Base, Arbitrum, Arc, Ethereum, Polygon and Solana, but is USDC-only. This is not the full online-checkout network/asset catalogue.
- XPay destination kinds mix bank settlement and crypto receiving. They are not payer funding sources. Cash balance cannot safely be enabled by adding a UI flag or calling the personal-withdrawal route.
- Online checkout selections already support authenticated stablecoin/cash choices, child sessions, atomic payment locks, idempotency and verified result projection. Their current cash path is tied to eligible NGN orders and merchant settlement. A terminal-to-checkout adapter must bind the same fields before cash is enabled for XPay.
- Pocket scanning previously required a method query parameter even for an otherwise valid unselected online checkout QR. This prevented scan-first choice inside Pocket.
- Existing X Layer/stock compatibility routes are not a generic new XPay rail. Preserve historical recovery and receipts; do not revive retired offerings.

## Limits and boundaries
- Online and physical QR purchases share USD 7,000 per payer per UTC day; Basic verification is required by the shared purchase ledger. No separate XPay daily allowance.
- Personal transfers remain separate: Basic USD 50 and Advanced USD 7,000 daily. Merchant withdrawals remain settlement operations governed by released funds and accepted quotes; do not charge them to payer purchase allowance.
- Every enabled network/asset and cash route must reserve the same purchase ledger before signing or transfer; switching routes must not create a second spend path for the same order. Unknown/in-flight results must reconcile before retry.
- Per-payment maximum is bounded by remaining purchase allowance, merchant acceptance and any applicable provider quote/capacity. Quote expiry and fees are shown before approval. Provider changes must not silently increase a previously approved debit.
- Existing creator controls (20 active terminals, setup-key bounds and three accepted assets across destinations) are resource/configuration limits, not daily payment allowances. Replace the three-asset model only together with validated per-network acceptance and backward-compatible persistence; do not remove it alone.
- Existing QR request protection is separate from money limits: authenticated write/read buckets, public discovery IP protection and route-specific protections. Preserve them. Current fixed-window storage is per-process, not distributed.

## First implementation
- Valid unselected online checkout QRs now open payment methods directly in Pocket without requiring a prior browser choice.
- Shared native chooser shows merchant and amount before method selection, keeps future methods disabled, respects explicit server method availability and blocks unsupported cash selection.
- Existing selected/in-flight checkout resume is preserved. Back from the first method sheet exits cleanly; preparation uses a shimmer.
- Targeted edits mirrored into native source. No payment/enforcement backend change, no fabricated XPay cash capability and no new merchant configuration enabled.

## Next implementation slices
1. Versioned terminal acceptance schema and stable server-created per-payment sessions; retain destination revision binding and legacy QR lookup.
2. Connect terminal sessions to shared checkout selection/payment locks and purchase allowance, with cash enabled only for verified supported settlement combinations.
3. Creator network/asset and cash controls; payer source-first UI, fixed/reusable amount handling, consistent receipt branding and audience.
4. Shared web/app entry and explicit fallback; test app installed, missing, disabled app links, return after installation and expired sessions.
5. API/browser regression plus Pixel creator/payer walkthrough before deployment. A new live money test must be distinguished from fixtures; deferred real document KYC stays out of this work.


## Acceptance configuration implementation
- Added versioned acceptance with explicit destination ID, receiving revision, network and asset. The API intersects settings with verified owned destinations and executable capabilities. No caller-supplied recipient is accepted.
- Creator Accepted payments sheet saves through existing PIN approval and optimistic version checks. Each receiving destination must retain an executable option. Cash is visibly coming soon and cannot be enabled through a crafted request.
- Public terminal reads expose only accepted networks. The POS quote path additionally enforces the saved route on the server.
- Clients that omit acceptance retain previous restrictions. Receiving revision changes do not silently enable new networks. Existing terminal IDs, legacy stock behavior and historical recovery remain intact.
- This slice retains existing USDC execution capability. The shared checkout session adapter, cross-method payment locking, additional assets, receipt/history mapping and app handoff remain unfinished.
- Targeted native source mirrored, including the missing shared checkout catalogue dependency. No APK installation, production terminal mutation or deployment for this slice.

### Acceptance checks
- API fixtures passed: ownership, PIN, stale versions, duplicate/foreign/stale routes, unsupported assets/cash, old-client preservation, public network filtering, server route guard and historical recovery.
- Acceptance migration regression passed, including revision changes and removed networks without silent widening.
- Browser component test passed at 320/390px light/dark, with real network icons: nonempty selection, duplicate save prevention, shimmer, disabled cash and retryable save failure. Screenshots inspected.
- Existing shared online/QR allowance, native payment resolution and inline wallet setup regressions passed.
- Focused diagnostics passed for 24 main and 32 native files; not full-repository checks.
- Broader pocket-unified-xpay-browser-smoke.mjs could not bundle: its browser dependency graph includes Node crypto/stream through jsonwebtoken. No UI assertions ran in that test. Integrated page and Pixel checks remain required.

## Validation of the first implementation
- Real scanner plus shared chooser browser fixture passed at 320px/390px in light and dark themes: methodless QR, merchant/amount context, cash and network/asset selection, disabled future methods, duplicate-click protection, Back, unavailable method rejection, existing-child resume and expiry.
- Existing QR allowance regression passed: shared online/QR cap, cross-rail concurrency, provider capacity, Basic KYC, harmless previews, retries/refunds, separate Personal ledger and UTC reset.
- Existing scanner browser regression passed, including actual QR-frame decoding, hostile QR rejection, camera lifecycle and authoritative read-only lookup.
- Focused web diagnostics passed (18 files); native diagnostics passed (29 files). Mobile screenshots inspected.
- These are source and isolated fixture results. This initial slice is committed for continued implementation, not yet deployed or installed on Pixel. No payment or production terminal was created or changed.
- Merchant onboarding verification is distinct from payer Basic KYC. Existing guidance about wallet-only merchant activation before merchant verification must not be interpreted as a payer purchase-limit exemption.

## Integrated verification follow-up
- Added xpay-acceptance-integration-browser-smoke.mjs using the real XPay page, settings component, route shell and bottom sheet, with authentication and unrelated money-execution boundaries mocked. Passed six-network layout, native Back, Close, Escape, PIN header, duplicate-save prevention, saved-choice reopening, save failure and return to QR at 320/390 light/dark. No live payments or configuration writes.
- Fixed the missing visible settings heading and aligned checkboxes with Pocket colors; mirrored into native source.
- Full production web source build passed. Native lineage verification initially caught the reviewed XPay type file missing from the allowlist; the exact changed/new acceptance files were added to the native source policy. Android build passed; final rebuild includes the heading correction.

## Owner revision: normal pages and retirement of stock QR payments
This section supersedes the acceptance sheet layout above.
- Accepted payments is a normal Pocket page with a scrolling list and fixed footer. Stablecoins opens a network page; Receive fiat opens currency and verified bank/mobile-money setup. Currency selection retains the existing supported country/currency mapping. No unsupported currency is enabled.
- The merchant NGN settlement route is not presented as cash balance or a duplicate payment method. Existing bank funding remains server-bound; cash balance remains disabled until its execution adapter is implemented.
- Card, Google Pay, Apple Pay, WalletConnect Pay and Bank transfer reuse checkout's exact upcoming-method component/icons and are disabled. Cash balance is also disabled and labelled Coming soon.
- Save remains fixed. Errors appear immediately above Save. Settings PIN/biometric prompts say Save changes; cancellation is silent in this editor and never presented as a failed payment. Actual PIN verification and single-use approval remain required.
- Network drafts survive navigation into fiat setup. Back unwinds network, acceptance, setup and terminal pages without opening a modal for the settings list.
- New stock QR setup, adoption/configuration and payment preparation are blocked on the server. Public terminal choices exclude the retired stock destination. Existing ready/submitted payment recovery, confirmation and receipts remain available; shared developer hosted X Layer execution remains separate.
- Updated regression covers real page, route shell, PIN gate and approval request with provider boundaries mocked: PIN cancel makes no configuration request, duplicate clicks produce one save, invalid empty network selections are blocked, bank funding is preserved, errors sit above fixed CTA, fiat setup returns correctly, and no stocks option appears. Passed at 320/390 light/dark.
- New stock QR retirement regression passes new-request rejection, immutable old-payment replay, confirmation/history and separate hosted checkout/fee-proof checks. Shared online/QR allowance and scan-first chooser regressions still pass.

### Deployment and device verification
- Source commit a5fb4685eb049175588f4baa0f58424e901f3a42 is live in deployment dep-dbtbmht6e07s73c0pmc0. Full web and native Android builds passed; the debug APK was installed on the connected Pixel with app data preserved.
- Actual Pixel walkthrough passed: normal Accepted payments page, six disabled upcoming methods, six stablecoin network choices, fixed Save above bottom navigation, Receive fiat currency/account setup and Android Back. All three device screenshots were visually inspected; no horizontal overflow was found.
- Device testing made no payment, saved no acceptance changes and changed no receiving account. Entering Receive fiat created the existing setup reference only.
- Production readiness checks returned JSON: public-config 200/ok and an unknown QR 404 with the expected unavailable message. These are readiness checks, not a live-money execution test.
- Shared checkout session integration, additional stablecoin assets and cash-balance execution remain subsequent work; this deployment does not enable those unfinished routes.

## Saved fiat receiving account
- Receive fiat reopens an owner-only read view with currency, bank/provider, account number and account name. The edit icon opens replacement setup; viewing creates no setup record. Back from editing returns to the saved account.
- Account details are read through authenticated terminal ownership and active destination checks, never added to public QR responses. Existing server approval and version checks protect replacement; the old account stays active until approved configuration succeeds.
- Browser regression at 320/390 light/dark passes view/edit/back, cancellation preserving the old account, and approved replacement immediately showing the newly saved account. API regression rejects foreign-terminal reads and replacement without approval and confirms public QR responses omit account details.
- Focused source diagnostics passed. Web and native Vite builds completed successfully; PowerShell reported stderr warnings as NativeCommandError despite the completed builds. Native lineage passed.
- Deployment dep-dbtbv4psrm7s73arc7b0 is live at source commit 92e74b07f7bfa1cee49be714f586e8798cc419cd. Android assembleDebug passed and was installed with data preserved. Actual Pixel read-only verification passed saved details, edit icon, Android Back and reopening: two account reads, zero setup/configuration writes, no payment. Screenshot inspected locally; account values are deliberately omitted from this audit. A request during rollout failed transiently; retry after deployment was live passed. Production readiness checks passed.
- Fixed bank-only terminal Stablecoins entry: open the dedicated six-network receiving setup when no stablecoin destination exists, instead of showing the bank funding route as a locked Base choice. Existing stablecoin destinations retain their acceptance editor. Bank funding is not widened. Setup retains fixed Continue, errors above CTA, shimmer and silent PIN cancellation. Integrated regression passes the bank-only case at 320/390 light/dark, including Back and no configuration writes.
- Coin-first creator layout: Stablecoins opens USDC, USDT, USDe and USDG, then networks from the shared checkout identity catalogue. X Layer appears for all four; BNB Chain for USDC/USDT. Catalogue entries do not grant payment permission: only existing USDC POS routes remain executable, and unconnected routes are explicitly Coming soon. This is UI/catalogue work, not completion of the shared checkout session/execution adapter. Unsaved network choices survive nested Back. Browser checks passed at 320/390 light/dark; full web build passed. Native source includes the previously missing shared catalogue dependency.
- Coin-first Pixel verification passed on the installed debug APK: all four coin icons, canonical network mapping, unavailable execution routes, Android Back and no overflow. No payment or receiving configuration was saved. Full web and native builds plus Android assembleDebug passed. Screenshot: .codex-temp/pixel-xpay-coins.png. Source commit 6741ced1e; deployment dep-dbtcm26k1f9s73c686dg.

## Executable X Layer and BNB QR routes
- Supersedes the catalogue-only restriction above. Added immutable, owner-bound stablecoin receiving destinations and coin-first configuration protected by settings approval and terminal version checks. X Layer accepts USDC, USDT, USDe and USDG; BNB Chain accepts USDC and USDT. Existing Circle routes remain USDC-only.
- Payers prepare a signed hosted child from server-resolved terminal, recipient, asset and revision. They continue inside Pocket through the existing X Layer/BNB approval, fee, allowance and settlement paths. Self-payment and stale receiving configurations are rejected; retry keys cannot change amount or route.
- Merchant history uses verified paid records and net settlement amounts. Payer email receipt eligibility is resolved against the owning terminal. Submitted settlement and historical receipts remain recoverable after receiving settings change. Pocket QR terminals do not create developer webhook deliveries.
- Dedicated HASHPAYLINK_XPAY_HOSTED_ENABLED rollout gate defaults off. Existing global chain gates remain required. Public choices exclude disabled routes; the broader wallet catalogue does not itself enable them.
- Neutral coin icons, fixed Save, errors above CTA, silent PIN cancellation and draft Back behavior are retained. Drafts are cleared on terminal/account changes.
- Passed integrated signed-child fixtures for ownership, PIN, recipient resolution, all four X Layer assets, BNB precision, retry immutability, stale configuration, recovery after edits, scoped history and receipts. Existing BNB/X Layer checkout, BNB payment service, shared QR allowance and retired stock QR recovery regressions passed.
- Payer browser regression passed StrictMode mounting, double-click protection, failed preparation retry with identical details and signed Pocket scanner navigation. Creator browser regression passed 320/390px light/dark, enabled hosted choices, PIN cancellation, one save, draft Back and saved fiat account replacement.
- These fixtures do not constitute a live-money payment. Production rollout and final device evidence follow below.
- Final rollout: source commit 5db4a51a2bba788ee8d4cc9c4ec83f68fc72952b is live in deployment dep-dbtdehtckfvc73ehcuhg, with the dedicated XPay hosted gate enabled. Full web/native builds, native source policy, 45-file main focused diagnostics, eight-file native diagnostics and Android assembleDebug passed. APK installed on Pixel with data preserved.
- Live public-config returned 200/ok; unknown QR returned the expected 404. Pixel read-only walkthrough confirmed four neutral coin icons, enabled X Layer/BNB choices for USDT, enabled X Layer for USDe/USDG, native Back and no horizontal overflow. Real device screenshots inspected: .codex-temp/pixel-xpay-coins.png and .codex-temp/pixel-xpay-wired-networks.png. An initial refresh during rollout timed out; retry after live status passed. A sleeping-screen UI attempt was repeated successfully after waking the device.
- No live payment, receiving-account edit or acceptance save was performed. End-to-end live-money confirmation remains distinct from the passing integration fixtures and device checks. Shared cross-method order locking and cash-balance execution remain separate unfinished work.

## Remaining USDT networks
- Connected Base, Arbitrum, Solana, Ethereum and Polygon to the existing signed hosted USDT checkout engine. XPay now supports USDT on all seven listed networks, while USDC retains its existing eight-network flow and USDe/USDG retain X Layer.
- Each added route uses an immutable, server-verified Circle receiving wallet for that network. Solana recipient comparison remains case-sensitive. Configuration retains settings approval, optimistic version checks and existing bank/other-coin routes.
- Signed checkout attempt references are preserved through Pocket scanner navigation. New signing and allowance checks reject changed receiving configurations and terminal-owner self-payments. Historical reconciliation still reads the immutable signed record after configuration changes.
- Verified merchant history includes net USDT receipts from these routes, with payer receipt eligibility scoped to the terminal. Pocket terminals do not generate developer webhooks.
- Integration fixtures passed actual signed children on all seven USDT networks, recipient binding, retry immutability, self-payment rejection, stale-setting rejection, settlement after edits, net history and receipt eligibility. Existing USDT EVM proof, Solana settlement, hosted adapter/recovery and shared allowance regressions passed.
- Browser tests passed seven-network selection/save/reopen, silent PIN cancellation, draft Back, fixed CTA/error position at 320/390 light/dark, and both hosted URL formats with attempt-preserving scanner handoff. Focused main diagnostics passed for 44 files. Live payment was not performed; rollout/device evidence follows.

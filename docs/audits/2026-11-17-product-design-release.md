# Product design release - 17 November 2026

Source commit: `08841f09964dcdfdf70ab5c6a16c2d8f7486a37c`.
Render deployment: `dep-dbu2ja68bjmc73a537k0` on the existing Hash PayLink service.

Scope: monochrome token identity across receipts/email/PDF, checkout Cash balance icon, currency label/type consistency, developer verification action feedback and mobile support clearance, removal of duplicate admin access controls, and settings/webhook dirty-save behaviour. Native-only work remains in its separate workspace and was not copied wholesale into the web release.

Preflight: production source build passed; full TypeScript check passed; 525 generated assets verified; scoped receipt, exact amount, audience, seller ownership and transaction deduplication suites passed. Earlier browser suites cover mobile/light/dark and action/retry/navigation behaviour. No real payment/email sent by checks.

Only reviewed source, assets, tests and audit docs were committed. Generated dist remains local; Render's configured build command rebuilds from source. Explicit commit deployment used because automatic deployment is off and the service's configured branch is older than the current release branch. No deployment configuration or secrets changed.

Previous live source: `51cd8e15077ea8dae7b62d1e38f312bc5299011d`, deployment `dep-dbtva3qfngtc73abd4eg`.

## Production verification

Render reports deployment `dep-dbu2ja68bjmc73a537k0` live as of 2026-11-17 10:22:25 UTC with source commit `08841f09964dcdfdf70ab5c6a16c2d8f7486a37c`.

- Public /api/health reports ok:true.
- app.hashpaylink.com and developer.hashpaylink.com return current HTML and loadable application modules.
- All five production monochrome token PNGs match the reviewed local files by SHA-256.
- Fresh-browser Playwright checks passed portal sign-in rendering, disabled empty-email Continue, 390px layout without horizontal overflow, light/dark switching, and invalid checkout recovery.
- Live dark portal and invalid-checkout screenshots inspected. No JavaScript page errors. Expected HTTP 400 for deliberately invalid checkout; existing Privy Solana-connector warning remains.
- No payment, email, business approval, API key rotation or production setting mutation was performed.

Limits: authenticated developer/admin settings were verified with synthetic browser fixtures, not the unavailable signed-in Chrome profile. Real payment completion and email inbox delivery were not exercised by this release check. Native-only fixes remain installed on Pixel but are not a Play Store release.


## Admin verification follow-up release

Source commit: `600f24f9d`. Deployment: `dep-dbu3k967bikc73874cd0`.

Production source build and full TypeScript check passed. Fresh generated dist verification passed (525 assets; generated files not committed). Scoped admin action browser suite and existing review regression passed before commit. Only the reviewed component, document-label helper, browser test and audit note were committed and pushed.

Signed-in onojacyano follow-up: application read succeeded without changing review/access state. Profile/app navigation worked with Playwright's animation-stability check bypassed; ordinary click testing is still blocked by hidden-tab rendering. Production Business details Save passed unchanged/edit/revert checks with the temporary edit restored and never saved. Activity summary toggle on/off exposed a separate false-dirty issue: Save stays enabled after restoring the original checkbox. Reload discarded that draft; no subscription was saved. The nested summary defaults are not normalized in editableProjectState. This is a follow-up, not included in this admin-only release.

Receiving-account screenshot was not accepted as evidence of that tab: it still showed Business details. Full live settings visual sign-off remains open. Theme restored to light. No keys exposed or created, payments sent, documents downloaded or production settings saved.

Render reports this follow-up live at 2026-11-17 11:32:48 UTC. Post-deploy public health, both app/portal entry modules and all five unchanged receipt assets passed. The production-referenced lazy-loaded OperationsWorkspacePage and verificationTypes modules contain the new readable owner/document labels and action-specific busy feedback. Initial local-filename/hash probe was unsuitable because the server build has different chunk names; verification followed production's module references instead. No claim of byte-for-byte identity with the local bundle.

## Summary preferences follow-up

Source: `1fd05d7f5`. Deployment: `dep-dbu3qumk1f9s73a8bg60`.

Fixes false unsaved changes when default activity summary settings are materialized and restored. UI comparison now uses visible preferences and the form defaults, excluding enrollment metadata. No subscription/API changes. Browser regressions passed for omitted and enrolled preferences, all three summary controls, concurrent independent edits, and Back without discard. Existing settings/webhook failure/retry/save tests passed. Production build and generated-asset verification passed. Full typecheck was not rerun for this narrow follow-up; the immediately preceding admin release passed it.

Render reports summary fix live at 2026-11-17 11:46:48 UTC. Public health, app/portal modules and unchanged receipt assets passed. Reloaded the signed-in onojacyano portal and verified via DOM-dispatched UI clicks: initial Save disabled, toggled Save enabled, restored Save disabled, original summary preference restored. Back returned to Apps with zero open dialogs. No Save action or subscription write performed. Physical click/visual verification remains limited by Chrome's hidden-tab/no-frame state; these are live form-state checks, not a normal mouse-interaction pass.

## Shared focus behavior release

Source commits: `3a0968bed` and final `e430867f9`. Render deployment `dep-dbu5p7jalhtc73frjbi0` reports live at 2026-11-17 14:02:53 UTC.

App-owned Pocket, checkout, developer/admin and portal controls share clean pointer/touch focus and a neutral two-pixel keyboard outline. Validation and selected-state borders remain intact. Hidden upload/date controls expose keyboard focus through their visible container; provider-owned interfaces remain outside the policy.

Shared-focus browser regressions passed at mobile/desktop widths in light/dark themes, including hidden controls, validation/selection preservation and provider scope isolation. Security action regressions passed. Main and native source builds, Capacitor sync and Android debug assembly passed; full TypeScript check was not rerun for this presentation follow-up.

Final debug APK installed successfully on Pixel without clearing app data. Real WebView checks passed touch, Tab and return-to-touch behavior in both themes; dark keyboard screenshot inspected. Light theme restored. No PIN or security setting changed, no payment submitted. This is a local debug install, not a Play Store release.

During web service replacement, public requests returned HTTP 502. After final deployment became live, public health, both application entry modules and all five unchanged receipt token assets passed. Verification followed production HTML asset references and confirmed the shared CSS, modality controller and final hidden-date focus rule on app.hashpaylink.com and developer.hashpaylink.com. This final web check verifies delivered assets, not an exhaustive live walkthrough of every screen.

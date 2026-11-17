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


# Website personal KYC and Pocket audit

Personal profiles now embed the existing Pocket KYC panel under Settings / Verification. The API, authenticated owner, provider checks and durable identity records are shared. Nigeria requires Basic before Advanced; Uganda retains its current National ID flow. No new countries, provider approvals or higher limits enabled. Business KYB is separate.

Concrete findings: the identity frame CSP omitted developer.hashpaylink.com, preventing website embedding. Both frame documents' submission-error listeners also omitted pocket.hashpaylink.com; added Pocket and developer origins explicitly. Retained origin/source validation, camera isolation and provider-result authority. Panel start is synchronously guarded against duplicate activation and stale status responses cannot overwrite a newer start.

Receiving wallets remain owner-bound and network-specific. Personal settings offer available Pocket wallets as draft defaults without saving them automatically or replacing existing addresses. Business accounts require an explicit Use my Pocket wallet for this business selection. X Layer/BNB use the verified embedded EOA; Circle addresses are never copied between chains. Unavailable wallets stay empty.

Passed: current V3 KYC handler tests (Nigeria, Uganda, provider entitlement, signatures/proof, matching, missing-callback recovery, timeouts, duplicate prevention and sandbox isolation), identity/guidance tests, Pocket browser tests (consent, submission versus approval, failure/support, safe-area, rate-limit cooldown and permanent errors), frame message isolation, website personal KYC/browser wallet choice, receiving wallet ownership and production eligibility. Fresh onboarding passed using the tsx loader.

Test maintenance: Pocket browser expectations were stale versus existing Done CTA and current support guidance; scoped its mock to KYC so unrelated FX requests are not mistaken for KYC retries. The older legacy pocket-kyc-smoke suite could not bundle due to stale durable-store mocks; this is not claimed as a pass. Current V3 handler suite is the active-path coverage. Full typecheck and final deploy evidence to follow.

No real identity details submitted, provider verdict fabricated, consent accepted, live wallet created, payment made or limit raised. User's historical failed attempt has no country/error details yet, so its exact cause is not established. Browser fixtures do not prove camera capture or an actual provider enrollment. Native APK has not been rebuilt in this change; served identity-frame fixes apply when it loads the updated frame.

## Release evidence

Source 322a2878b3915999a3230c6f11f481325b62c202 deployed via dep-dbidtqmtlv9c73csvkvg, live 2026-10-30T18:21:34Z. Render production build succeeded. Full typecheck remained 43 existing diagnostics with no new normalized diagnostics versus developer-terms baseline.

Live Playwright: authenticated personal profile loaded the embedded panel and /api/pocket/kyc returned HTTP 200. Nigeria Basic and disabled Advanced, Uganda National ID fields, and unchecked consent/disabled submission were verified. Returned country preference to Nigeria. Both live identity-frame variants returned HTTP 200, explicit developer frame-ancestor permission, camera=(self), and Pocket/developer submission-error origin entries. No provider session/camera/enrollment was started. Temporary personal app dev_36491be0c8e24e89a3 was deleted after the check.

Unrelated billing additions in server.ts remain uncommitted and were excluded using a scoped index patch. No dist files included.

## Connected Pixel pre-submission audit

Inspected the actual com.hashpaylink.pocket WebView on connected Pixel 5A160DLCH006VM using Playwright CDP. Basic shows verified; Advanced is selectable. NIN and Government ID choices update the CTA correctly. Both require unchecked explicit consent and keep submission disabled before consent. Returned to NIN with consent unchecked. No horizontal overflow at the device's 426 x 952 CSS viewport; native screenshot inspected for layout and visible CTA. No stored sanitized KYC error diagnostic in this WebView session. Android appops reports CAMERA allowed while foreground.

No provider session was opened, no camera capture or identity submission performed, and no PIN or identity fields entered. Left Advanced/NIN open for the user's own test. This verifies entry/UI/OS permission state only; actual provider capture, upload and final approval remain to be observed. Screenshot: output/playwright/pixel-kyc-advanced.png.

# Developer verification on phone

The user confirmed that Advanced verification passed cleanly on Pixel before this change.

Personal verification now offers **Continue on phone**, with a QR code and copyable browser link. The phone signs in through the existing developer authentication flow using the same account. No Pocket installation is required. Business KYB remains separate.

The link includes only the current origin/path, project/profile routing, verification section, selected level and country, and a presentation flag. It excludes authentication tokens, provider session tokens, identity details and URL fragments. The flag grants no access: existing authenticated, owner-bound status/start/resume endpoints remain authoritative. Completed checks are shared; unsubmitted form fields and photos are not transferred.

While the phone option is open, desktop start controls are hidden and status refresh runs on focus/visibility and at the existing 15-second interval, respecting visibility and retry cooldown. Completed verification stops this additional polling. Opening or copying the link never creates a provider session or grants consent.

Validation:
- Developer browser smoke passes: allowlisted link, no token/fragment leakage, no auto-start, desktop focus refresh, clipboard fallback, mobile continuation without recursive QR, fresh unchecked consent, and 320/390/1280 layouts.
- Shared KYC browser regression and KYC V3 API regression pass, including owner isolation, signed/provider-confirmed results, method switching, duplicate prevention and Uganda validation.
- QR screenshot inspected at output/playwright/developer-verification-phone.png.
- Live cross-device OTP and capture are not yet exercised for this new handoff. Existing Advanced completion is user-reported evidence from before the handoff change.

Release evidence:
- Production build succeeded in 1m 41s.
- Full typecheck: same 43 baseline errors; normalized comparison found no new errors.
- Commit 26db20a969424f69ac9449b78b661888733a9ae3 deployed as dep-dbifv9qjnfac738q6v5g; confirmed live at 2026-10-30T20:41:42.444819Z.
- Fresh-browser live Playwright check confirmed Continue verification, same-account instruction, email input and sign-in gate with query retained. No OTP requested. A transient 502 during startup cleared once live.

## Follow-up handoff audit

Confirmed gaps fixed:
- Missing/inaccessible project IDs previously fell back to another owned app. Phone continuation now requires the exact accessible, active personal app; closed/business/missing targets show a clear account/link error with Change account and Back to dashboard. Failed loading is distinguished from invalid access.
- Project data from an earlier signed-in owner is gated until the current owner's projects load. The shared personal KYC component remounts on account change.
- Selected NIN versus government ID now survives the link. Only allowlisted method values are used; existing pending sessions remain backend-authoritative.
- Desktop Change verification method is hidden while phone handoff is open.

New full-portal browser audit (scripts/developer-phone-handoff-audit.mjs) verifies wrong/removed/business targets with no KYC requests; delayed account switch without stale KYC; project-load recovery; preserved method; fresh consent; server-confirmed desktop completion; actual QR decoding; clipboard rejection; Basic/UG routing; expired authentication; submitted-state no-repeat controls. All APIs are fixtures. The preview now explicitly disables out-of-scope wallet setup and exposes synthetic account changes.

The backend remains owner-bound and atomically guards duplicate starts; the existing resume path retains its 20-second opening cooldown. This handoff is authenticated continuation, not transfer of an active camera session or a single-device capture lock. Close desktop capture before continuing on a phone.

Remaining live evidence: an unverified account must scan, sign in, allow its camera and complete capture. iOS Safari capture has not been exercised in this audit. No real identity data or OTP was submitted by the assistant.

Audit release evidence:
- Production build passed in 1m 51s; full typecheck retains exactly the same 43 baseline errors, with no new normalized diagnostics.
- Personal verification browser smoke, full portal phone audit, and shared Pocket KYC browser regressions pass.
- Fix commit 6043b1671ce2744a8bbe70084b0c0f419da1fc69 deployed as dep-dbig8s8473hc73dpieog, confirmed live 2026-10-30T21:01:48.60973Z.
- Signed-in live Chrome invalid-project handoff correctly displayed Check your account or verification link with Change account and Back to dashboard. No identity submission or sign-out was performed. Temporary audit tab closed; original developer tab restored. Browser-extension unload warnings and the existing Privy Solana configuration warning remain unrelated observations.

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

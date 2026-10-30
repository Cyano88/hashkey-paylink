# Fresh builder onboarding audit - 2026-10-30

## Verified

- Production access handler suite: personal KYC versus business KYB, rejected client-forged approval/type changes, provider calls blocked before eligibility.
- Sandbox suite: 17 supported asset/network combinations, owner and key isolation, key revocation, idempotency, terminal transitions, signed fixtures and production boundaries.
- Profile browser suite: separate personal/business data, app inheritance, deleted app exclusion, explicit business naming, unsaved-edit handling and responsive layouts.
- New empty-account Playwright suite: root starts in Personal Sandbox; simulated checkout survives reload; first business requires an explicitly entered name; business sandbox is empty and separate; production app creation inherits business/personal type; no automatic KYB approval.
- Getting-started source matches the top-right profile selector, bottom-left Production switch, server-side key and webhook responsibilities, receipt configuration, and sandbox limitations. Local fiat launch guidance remains withheld pending provider, policy and limits decisions.
- A separate clean Chrome session named hashpaylink-onboarding is open on the live developer sign-in screen. Existing authenticated session remains separate.

## Pending live evidence

User-selected new email and user-completed OTP are required for genuine first-signup verification. The empty-account suite uses simulated identity and in-memory stores: it is not evidence of successful live signup, email delivery, funded checkout, settlement, or provider approval. No new live business, payment, identity document or verification submission was created during this audit.

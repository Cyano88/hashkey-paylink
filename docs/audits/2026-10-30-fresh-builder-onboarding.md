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

## Live signup and session restoration finding

- support@hashpaylink.com completed live OTP and landed in Personal Sandbox with no initial test payments.
- Created and simulated paid: test_chk_149147c1ff0140029a16ca691a472ea0, 1.50 USDC on Base, Onboarding check - no funds. No real funds moved. Record survived signing back in.
- Two refreshes returned to sign-in. Privy session endpoint returned 200 with a user and session_update_action=ignore, followed by a successful explicit sessions/logout request. Only selected non-secret response metadata was inspected.
- Public Privy app configuration has require_users_accept_terms=true, while this user has has_accepted_terms=false. Installed @privy-io/react-auth 3.28.0 startup code explicitly logs out an existing session when required terms have not been accepted. Our custom email flow omitted the acceptance step.
- Fix: DeveloperTermsGate wraps developer layout content, blocking dashboard mounting for authenticated users without accepted terms. Explicit unchecked checkbox plus Agree and continue calls documented installed-SDK useAcceptTerms. Errors remain on the consent screen with retry. Already accepted users skip the screen. Provider requirement remains enabled. No consent is recorded by the assistant on the user's behalf.
- Fixture checks pass for unchecked/default state, no automatic acceptance, hidden dashboard, failure/retry, accepted-state refresh, responsive mobile layout and fresh builder flows. Live acceptance and post-acceptance refresh remain pending deployment and the user's explicit agreement.
- Scope: developer/operations layout only. Other custom email surfaces have not been declared audited or fixed by this change.

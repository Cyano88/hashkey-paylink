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

Terms gate source a02ac0203453b64f6560dd8d683c7dafdfa0f98c deployed live via dep-dbicr0rbc2fs73ao8eu0 at 2026-10-30T17:07:48Z. Production build passed; full typecheck is unchanged at 43 existing errors. Reloading the existing unaccepted session still triggers the SDK startup logout as expected; a fresh sign-in code was requested for the user to reach the new explicit acceptance screen. Post-acceptance refresh remains pending user action.

## Post-acceptance live verification

The user completed acceptance. Live refresh retained the authenticated dashboard and the paid sandbox fixture. Production entry worked; a temporary personal draft app (dev_8db6ddcd7ec94daf82, Onboarding test - no payments) was created. API key creation was visibly disabled while settlement setup was incomplete. Personal verification showed personal KYC rather than business KYB. No wallet, live key, real payment or KYC submission was created. The temporary draft was deleted through the reviewed in-app removal flow. Two stale guide sentences requiring universal business review were corrected to reflect wallet checkout availability and personal KYC/business KYB for local fiat. Live business profile setup awaits the user-selected business name.

## Live business branch

User authorized any test business name. Created Onboarding Test Business (business_4111f4bb5de94bc69459cc86ae7d7770). Its sandbox started empty; simulated paid test_chk_86d640ab52274a50898a0558caa72d56 (1.50 USDC, Base) remained separate from Personal and survived reload. Created temporary business app dev_dc730632831a408496; verification showed Business verification / Not started, and key creation was disabled for incomplete settlement setup. Removed the unused draft through its normal removal review. Kept the named business profile and sandbox fixture for continued testing. No live keys, receiving wallets, real transfers or identity documents were submitted. Multiple post-acceptance reloads retained login.

Remaining policy mismatch: both the KYB UI and api/developer-verification.ts submission validator require aml and kyc documents for every business. Review those universal document requirements against the intended ordinary-merchant model (Pocket handles payer verification) and provider/manual review requirements before changing them. No policy requirement was removed during this test.

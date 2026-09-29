# Uganda Basic KYC - local implementation

## Provider evidence

Production token and services/config returned HTTP 200 on 2026-09-29. Uganda exposes basic_kyc / NATIONAL_ID_NO_PHOTO. This confirms advertised capability, not successful paid V2 execution.

Official current documentation directs Basic KYC to the legacy REST API:
- https://docs.usesmileid.com/products/onboarding-without-biometrics/basic-kyc
- https://legacy-docs.usesmileid.com/supported-id-types/for-individuals-kyc/backed-by-id-authority/supported-countries/uganda/national-id-without-photo/basic-kyc-in-uganda

Uganda requires NIN (14 alphanumeric characters), card number and date of birth. Names are not matched; no photo, liveness or residence evidence is returned. The Uganda-specific V2 contract requires card number and date of birth, even though the general V3 coverage table marks these optional.

## Implementation

- Uganda defaults to a native National ID details form and POST /v2/verify_async, not the hosted biometric SDK.
- Explicit consent, authenticated owner, capability preflight, atomic duplicate/attempt guard, random callback proof and hashed owner reference.
- Callback is only a notification. Signed credentialed job_status response must match stored job/user and job type 5.
- Basic-only approval requires result 1020, job_success and exact DOB/card matches with verified ID number. Partial/inconsistent results remain review. No fabricated legal name.
- Existing NG BVN/selfie and Advanced logic preserved. No change to shared daily allowance or bills exclusion.
- Timeout/uncertain submission remains pending, cannot automatically resubmit. Status polling reconciles the original job. Unresolved jobs become review after 24 hours; they can still reconcile later.
- Raw NIN, card number and DOB are sent to Smile, never persisted in Pocket's durable store or 0G. Only keyed identity digest, consent and result metadata are stored.
- Existing document route remains gated by actual product availability for future activation.

## Validation and rollout

KYC V3 regression and Uganda Basic tests pass: input validation, exact/partial/inconsistent result handling, owner binding, duplicate prevention, ambiguous timeout and raw-identity exclusion. Transfer tier tests include sandbox/pending/partial/legacy exclusion.

No real applicant, paid submission, production deploy or Pixel installation performed. A consented live test is still required to verify V2 account permission and provider result shape before claiming end-to-end readiness.

## Single verification flow - subsequent product decision

User authorized a successful Uganda Basic check to cover the higher payment flow. Verification evidence remains Basic/no-photo; separate paymentLevel grants access to the existing configured Advanced payment allowance. Uganda UI shows one Identity verification option and no Advanced upgrade CTA. Nigeria retains its two-step flow. Over-limit Uganda payments return daily-limit reached, not a request for an unavailable second check.

Production configuration read on this change: POCKET_ADVANCED_DAILY_LIMIT_NGN is unset. Until the daily amount is selected and configured, the conservative existing 50,000 NGN-equivalent fallback still applies. No unlimited payments or invented new limit. Asked user to select the daily USDC amount; no currency conversion/config change applied.

Added regression coverage for Uganda above-Basic allowance, exact cap, missing configuration, evidence-vs-payment distinction and unchanged Nigeria limits. Local only; no deploy or device installation.

## Current limit confirmed

User selected the existing Nigeria limit for Uganda too, with USDC-to-UGX display. No new numeric ceiling: the current effective cap is 50,000 NGN equivalent, shared across bank transfers and XPay destinations. The existing configured higher allowance (if subsequently set) remains the one-step Uganda payment tier policy. Bills retain their separate policy.

Limits response now includes verified ID country; Uganda KYC/allowance views show USDC primary and UGX equivalent using existing live Paycrest quotes, independently of the display-currency preference. No nationality/residence inference or global profile preference update. Regression confirms NGN and UGX payments exhaust the same account allowance and retries preserve the original conversion.

## Country defaults and final KYC integration

Rates defaults from the account-scoped selected ID country; a persisted server KYC country refreshes that preference on another device. Manual NGN/UGX selection in the open rates screen is never overwritten by that request. This is a display preference, not residence or permission evidence.

Profile response includes kycLevel/kycCountry independently of nameStatus. Uganda shows Verified; Nigeria shows its verification tier. Because no-photo checks do not verify names, Uganda collects a declared full name for payer records, persists it separately, and does not mark nameStatus verified. The 0G privacy guard rejects declaredName. Outgoing beneficiary lookup accepts verified KYC independent of verified-name status; receiving ownership checks still require verified name evidence. XPay uses the declared payer name where a verified name is unavailable.

Regression checks: country preference isolation, KYC identity/name separation, no-photo result matching, shared cross-country daily allowance, beneficiary-vs-owner enforcement, profile and bank-withdraw adapters, changed-file TypeScript checks. Initial browser-boundary smoke could not start because the playwright package is absent from this checkout; no Pixel UI or real applicant test claimed. Frontend build is checked in an isolated temporary output folder.

Final isolated Vite build completed (1m 7s). PowerShell returned exit 1 from redirected native warnings even though Vite reported success; no build error in the final log. Browser/Pixel and paid live verification remain untested.

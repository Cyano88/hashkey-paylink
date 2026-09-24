# Pocket Smile readiness ? 2026-09-25

Enrollment remains paused. These fixes do not enable KYC or establish provider approval.

## Verified provider configuration

Production authentication and services configuration returned 200 using hosted_web 12.0.4 headers. Partner biometric selection includes BVN_MFA, NATIONAL_ID and VOTER_ID; Pocket requires BVN and NIN_V2. Generic supported-ID catalogs do not establish partner entitlement. Do not silently substitute BVN_MFA. Document capture uses the intersection of partner selection and supported document types (currently PASSPORT).

## Changes

- Preflight partner permissions before creating a verification session; preserve allowed document types on each job.
- Persist explicit consent and notice version.
- Recognize raw hosted Accepted responses and documented result envelopes; never treat browser submission as verified identity.
- Preserve sanitized provider errors and stop automatic retries for permanent authorization/configuration failures.
- Recover missing callbacks through bounded authenticated replay to the original callback URL; browser references cannot bind identity or approve a job.
- Preserve identity matching through provider credential rotation using POCKET_KYC_IDENTITY_MATCH_KEY. It was initialized privately from the previous matching key to preserve historical hashes. Keep it stable and separate from future Smile credential rotations.

## Validation

V3 and legacy API fixtures, frame browser smoke, panel browser smoke and focused TypeScript checks cover ownership, signatures, submission formats, callback recovery, retry behavior, consent, method restrictions and two-step matching. No real identity or paid production verification was submitted.

The hosted SDK sends accepted submissions through Result and actual errors through Error. Failure-in-Result coverage hardens compatibility; it does not prove the original production rejection had that shape.

## Launch gates

Smile must enable/confirm the required partner methods. Then run a consented end-to-end production verification, confirming camera capture, callback delivery and matching second-step identity before enabling enrollment. Authentication success alone does not satisfy these gates.

## Testing reopened — 2026-09-25

At the user's request, Profile now exposes Verify with Smile ID and hosted camera capture is available again. Existing BVN/NIN entitlement preflight remains mandatory; opening enrollment does not grant provider permissions or bypass verification. Payments remain unchanged and no KYC gates were reintroduced. POCKET_KYC_ENROLLMENT_PAUSED=true can pause new/resumed sessions and hosted capture again without deleting records. A real production verification is still required before declaring KYC ready.

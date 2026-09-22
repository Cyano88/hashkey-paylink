# Pocket Smile two-step verification

Implemented 2026-09-22. Nigeria only. Existing spending limits unchanged.

## Flow
1. Complete BVN and facial verification.
2. Choose NIN (NIN_V2 Biometric KYC) or government ID (passport, driving licence or national ID card with document verification and selfie).
3. Wait for the authenticated provider verdict. Browser upload completion is never approval.

Each additional check references the approved BVN job. Normalized names and date of birth are compared through a keyed digest; raw DOB, identity numbers and biometric media are not added to Pocket records by this change. Missing or mismatched evidence cannot complete the pair. Production POS eligibility requires both approved stages in production. This is an identity policy, not a claim that the document alternative satisfies every rail's NIN or regulatory requirements.

Existing records keep their original policy and job identifiers. Legacy approved BVN evidence is refreshed from the authenticated provider status endpoint before starting the second check when matching evidence is missing. Per-stage provider user identifiers avoid re-enrolling the same provider user across the two products. No pending job is replaced. Provisional provider reviews continue polling.

## Provider compatibility

Pocket retains the current v1 API/hosted SDK adapter; the v12/v3 migration is separate. Verified public legacy catalogue: https://testapi.smileidentity.com/v1/services (2026-09-22). Nigeria NIN_V2 and document types PASSPORT, DRIVERS_LICENSE, NATIONAL_ID are listed. Catalogue presence is not account entitlement.

Document shell source: https://cdn.smileidentity.com/inline/v1/doc-verification.html. The shell stays on the isolated API origin with the existing source/origin-checked message bridge. Provider capture scripts are unchanged. Layout and input presentation follow Pocket's neutral, full-height treatment.

## Validation

- Backend fixture: authentication, consent, duplicate prevention, owner/country/method isolation, server-authoritative callbacks, both second-step routes, identity mismatch, sandbox separation, production pair requirement, provisional-to-final transition.
- Browser fixture: existing verification regression plus method choice, consent reset, selected product dispatch and pending/final state handling.
- Existing bridge fixture: origin/source spoof rejection, token exclusion from URL and single upload callback.

Provider-side end-to-end acceptance with account-enabled NIN/document services is still required. Automated tests use sanitized fixtures, not real identity submissions. Production rollout remains controlled by the existing production flag.

# Business payer KYB mapping - 2026-10-30

Scope: explicit director designation in the existing business-verification flow and a server-only Paycrest organization payload mapper. This does not activate onramp, introduce a new KYB provider, or substitute business KYB for Pocket personal KYC.

## Changes

- Business person records have an optional director boolean; omitted historic values normalize false. Director, beneficial owner and authorized representative remain distinct roles.
- Form collects director role; reviewer display exposes it and instructs checking it against company records. Existing submitted/approved revision locks still apply. No historic approval is automatically granted director evidence.
- Zero-share directors can be included without falsely declaring ownership or control-person authority. General business KYB does not newly require every applicant to have a director; the specialized payer mapper requires one.
- mapPaycrestBusinessPayer accepts only an owning business actor, matching project, current approved revision with recorded manual review evidence, and the NGN business-own-funding purpose. It decrypts the reviewed application on the server and validates it again.
- Only explicitly declared directors are mapped to organizationDetails.directors. NGN payloads require each included director's BVN/NIN, not a passport-only substitute. Company registration and director birth dates come from the approved record.
- Mapper excludes PEP flags, residential addresses, uploaded files and unrelated owners from its returned payload. It does not log identities or make provider requests.

## Boundary

The mapper is an internal tested building block, not a public endpoint or an operational onramp connection. No route calls it to create an order in this release. Before connecting it: establish provider approval and disclosure/retention policy, authenticate the actual business payer and authority, verify payer/refund bank ownership, bind the order to that approved revision, and cover identity changes/consent/holds/refunds end-to-end. It must never supply a merchant's KYB for an unrelated checkout customer. Personal payer data remains a separate integration.

## Verification

- developer-business-payer-smoke: expected organization payload; ownership/purpose/currency/revision checks; draft/rejected/suspended/review-evidence rejection; explicit director requirement; historic-record rejection; zero-share director; adult validation; BVN/NIN mapping and minimal payload.
- developer-verification-smoke: encrypted director persistence, submitted/approved locks, reviewer access, evidence and business review flow.
- developer-verification-browser-smoke: actual component workflow, director checkbox, file upload, draft/submission, locked keys, 320/390/768/1440 light/dark and no overflow/page errors.
- Fixed synthetic preview bug: remove-app mock parsed uploaded File as JSON; limited parsing to string bodies. Live upload code was unchanged.
- Production build exit 0. Existing chunk/annotation warnings remain.
- All identity data used by tests is synthetic. No real Paycrest order, KYC transmission or money movement.

Source schema checked: https://docs.paycrest.io/implementation-guides/sender-api-integration#on-ramp-customer-kyc

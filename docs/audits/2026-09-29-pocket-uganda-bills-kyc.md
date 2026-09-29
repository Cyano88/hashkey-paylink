# Uganda Bills and KYC integration audit - 2026-09-29

Status: local implementation; not deployed or installed on a device. No live purchase or paid verification was submitted.

## Production capability evidence

Authenticated read-only VTpass production catalogue returned Uganda (UG, UGX, +256). Mobile Top Up product 1 lists Airtel (246), MTN (15), UTel Mobile (248). Mobile Data product 4 lists MTN (15). Providers and plans are fetched live, not hardcoded as the purchase authority. TV and electricity Uganda coverage was not established and is not enabled.

VTpass delivers face value in UGX but charges our provider wallet in NGN. Example read: UGX 250 MTN daily 30 MB has NGN 99.03 charged amount; flexible Airtel/MTN read rate was NGN 0.3962 per UGX. These are audit observations, not fixed prices. The API also mixes voice/SMS-only products into the data catalogue; those are filtered out.

Smile production token and services/config calls returned HTTP 200. The only Uganda entitlement returned was basic_kyc / NATIONAL_ID_NO_PHOTO. No Uganda doc_verification or biometric_kyc entitlement was returned. The public supported_documents endpoint returned Uganda identity card, passport and drivers licence, among others. Public coverage is not account access.

## Implemented boundaries

- Airtime/Data destination selector reuses PocketSelect. Nigeria-only TV/electricity label their destination. Account nationality never restricts purchase destination.
- Uganda phone normalization, live operator/variation selection, server-authoritative price calculation. Client NGN/price overrides are ignored for Uganda.
- Separate durable international delivery metadata (UGX) and provider cost (NGN). Same USDC quote, platform fee, exact transfer verification, idempotent vending, provider requery, refund and activity paths as Nigeria.
- Provider contact email comes from the authenticated identity and is excluded from the public intent. No new 0G storage path.
- International purchase sends country, operator, product type, variation and delivery amount required by VTpass. It never passes NGN cost as UGX face value.
- Confirmation/status/receipts show recorded delivery value and currency alongside USDC; home-currency live estimates do not substitute for bill delivery value.
- Smile country-bound document session adapter for Uganda, Basic only. The provider's account entitlement AND public document list must both allow a document before any session is saved or bound token created. No-photo basic_kyc cannot grant the document/selfie tier.
- Signed callback, private proof, authoritative provider status, country/document type and identity evidence must agree. Existing Nigeria BVN/Advanced policy and sensitive data boundaries remain.
- The KYC selector is explicitly the identity document country; it does not claim verified residence. Account residence/personalization is a separate future profile change, not inferred here from an ID.

## Tests and remaining launch work

Regression and Uganda-specific tests cover server-side pricing, phone/operator validation, fees, duplicate vending prevention, country-bound KYC, missing entitlement rejection, callback country mismatch, existing Nigeria KYC, bills store/client/webhook/refund/activity consistency.

Before Uganda KYC can be offered: Smile must enable Uganda Document Verification on the current production hosted Web v12/V3 integration including selfie/liveness, then a consented real applicant test must confirm the supported result fields and eligibility. Do not substitute no-photo ID lookup silently.

Before describing Uganda Bills as live-tested: run one explicitly authorized small purchase through the production app, confirm VTpass international vending access and recipient delivery, then verify activity/receipt reconciliation. Readable catalogue access alone does not prove delivery permissions.

No account-country preference restriction has been deployed. Display preference and bill destination remain separate.

## Completed verification

- pocket-uganda-bills-smoke: passed (catalogue parsing, pricing, phone validation, purchase payload).
- pocket-bills-handler-smoke: passed, including Uganda server pricing and exactly-once delivery.
- pocket-bills-store/client/webhook/refund-handler/activity-consistency and pocket-data-bundles smoke checks: passed.
- pocket-kyc-v3 and pocket-kyc-transfer-limits checks: passed, including Uganda no-entitlement and country-binding cases.
- Changed-file TypeScript diagnostics: zero.
- Vite production build completed (12240 modules; existing vendor/chunk warnings). PowerShell reported a nonzero wrapper status from stderr warning handling, but the Vite log confirms completed output. Generated dist changes were removed after verification.
- Browser fixture at 390x844: Uganda airtime input/presets show UGX, Uganda MTN data displays UGX 250 for the 30MB example, bundle tap selects the correct variation, no horizontal overflow or runtime errors. Light/dark screenshots are in output/playwright. Fixture-only missing font asset warnings do not represent the production build.

Awaiting explicit recipient/network/UGX amount for a controlled live airtime test. No funds spent.

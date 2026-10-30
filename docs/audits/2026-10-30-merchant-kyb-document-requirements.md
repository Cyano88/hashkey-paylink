# Merchant KYB document requirements - 30 October 2026

Default company evidence remains incorporation, articles and business address; each listed owner/controller requires identity and address evidence. AML and KYC policies remain supported uploads under Additional documents, optional at initial submission and available when requested during manual review. Existing documents are retained.

The previous universal policy requirement was a local hard-coded checklist, not a provider requirements response. This is a merchant onboarding product decision, not a finding that policies are unnecessary for every business. Reviewers must request activity-specific evidence before approval where appropriate. Existing reviewer feedback and changes-requested workflow remain; no automatic per-business requirements engine is introduced.

Manual review, reviewer permissions/reference, identity checks, production eligibility, payer KYC and provider route gates are unchanged. No provider approval or regulatory clearance is implied.

Sources reviewed: https://docs.usesmileid.com/ (SmartCheck manual verification); https://docs.paycrest.io/implementation-guides/sender-api-integration (sender KYB and actual payer source.kyc). Neither source was treated as an exhaustive merchant document checklist.

Validation: handler smoke passed submission without AML/KYC policies, rejected each missing core document, and retained encryption, revision locks, ownership isolation and approval gating checks. Playwright passed optional labels, three core uploads, mobile wizard and responsive layouts at 320/390/768/1440 in light/dark. Production access regression passed. Vite production build completed.

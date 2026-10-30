# Merchant KYB document requirements - 30 October 2026

Default company evidence remains incorporation, articles and business address; each listed owner/controller requires identity and address evidence. AML and KYC policies remain supported uploads under Additional documents, optional at initial submission and available when requested during manual review. Existing documents are retained.

The previous universal policy requirement was a local hard-coded checklist, not a provider requirements response. This is a merchant onboarding product decision, not a finding that policies are unnecessary for every business. Reviewers must request activity-specific evidence before approval where appropriate. Existing reviewer feedback and changes-requested workflow remain; no automatic per-business requirements engine is introduced.

Manual review, reviewer permissions/reference, identity checks, production eligibility, payer KYC and provider route gates are unchanged. No provider approval or regulatory clearance is implied.

Sources reviewed: https://docs.usesmileid.com/ (SmartCheck manual verification); https://docs.paycrest.io/implementation-guides/sender-api-integration (sender KYB and actual payer source.kyc). Neither source was treated as an exhaustive merchant document checklist.

Validation: handler smoke passed submission without AML/KYC policies, rejected each missing core document, and retained encryption, revision locks, ownership isolation and approval gating checks. Playwright passed optional labels, three core uploads, mobile wizard and responsive layouts at 320/390/768/1440 in light/dark. Production access regression passed. Vite production build completed.

Live verification: source de0fb96033d43320d6c07dcb8327d0d252b63233, Render dep-dbid8j0m7kps73cip21g live at 2026-10-30T17:36:47Z. Playwright refreshed the authenticated Onboarding Test Business profile and verified all three core company uploads Required and AML/KYC uploads Optional. Temporary app dev_31d491fa1f324ceea3 was deleted after inspection; no documents, verification submission, keys or payments were created. Business profile and sandbox test retained.

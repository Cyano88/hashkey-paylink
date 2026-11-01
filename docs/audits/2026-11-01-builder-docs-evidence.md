# Builder onboarding and country documentation evidence

Checked against the current release source, not inferred provider approval.

| Documented behavior | Implementation evidence |
| --- | --- |
| Existing linked profile preserved; explicit Individual maps to Personal; missing classification maps to isolated Business | src/lib/builderProfiles.ts: projectBuilderProfileId, builderProfilesForProjects |
| Fresh signup form only when there are no apps and no complete profile | src/pages/DeveloperPortalPage.tsx: BuilderOnboarding branch |
| Missing name/country prompt, gating new dashboard apps and verification | src/developer/BuilderCountryPanel.tsx; DeveloperPortalPage |
| Legacy project creation without a profile ID remains compatible and defaults to Business | api/developer-projects.ts: create action |
| Country cannot be self-service changed; saved profile country propagates to its apps; submitted KYB country must match | developer-projects: set-builder-country, setup-builder-profile, verification-save/submit |
| Multiple business profiles, project-level verification records, single settlement mode per project | builderProfiles.ts; developer-projects: create/create-builder-profile and update settings |
| Country alone does not activate NGN/UGX; NGN resolves bank name; UGX provider and owner identity checks; local rail Base USDC | developer-projects: local settlement validation and prepareDeveloperNairaCheckout; developerSettlement.ts |
| NG Business human checkouts require NGN; other profiles can omit currency; only explicit NGN supported | api/checkout-pricing.ts: requiresNgnPricing, validateCheckoutCurrency |
| Fresh Paycrest Base reference, stored quote; exact NGN bank payout price; old order price preserved | checkout-pricing.ts; hosted-checkouts.ts; developer-projects.ts; scripts/ngn-checkout-pricing-smoke.mjs |
| Shared Basic identity on web, NG/UG identity selectors | CheckoutVerification.tsx; PocketKycPanel.tsx; api/pocket/kyc-level.ts |
| Dynamic buyer allowance, separate Pocket limits, reservation/refund/reset semantics | api/checkout-buyer-allowance.ts; api/pocket/spending-limits.ts; 2026-11-01-checkout-buyer-allowance.md |
| Profile-scoped simulation keys/data; no live payment | api/developer-sandbox.ts; developer-builder-profiles-smoke.mjs |

Existing policy tests run: developer-builder-profiles-smoke,
developer-production-access-smoke, ngn-checkout-pricing-smoke,
developer-local-settlement-smoke and developer-sandbox-boundary-smoke.
TypeScript and the production build passed. Playwright checked the guide at
390px and 1280px, section navigation, compliance content and document overflow.
The section-link check found headings obscured by the sticky header; shared
documentation sections now reserve scroll space above their headings.
No merchant/profile data, permissions, country, verification or payment was
changed by this documentation work. New-market/provider approval is not inferred
from the existence of a form option or a successful fixture.

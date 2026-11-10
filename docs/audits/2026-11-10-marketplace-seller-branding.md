# Seller verification bank details and branding - 2026-11-10

The hosted seller page now shows the bank name, verified account holder name and masked last four digits. Refresh retrieves active bank records only for the authenticated, claimed project/seller scope. Developer-facing verification status remains unchanged. Institution lookup failure displays the bank code; it never invents a bank name. Full account numbers and encrypted/evidence fields are excluded from the presentation response.

The header reuses HashPayLinkCheckoutBrand for both loading and loaded states. The footer says "Identity verification powered by Smile ID" and uses the unmodified official Smile ID SVG from https://cdn.prod.website-files.com/69cecfcd51ce55fce000c092/69ea5dbe0f76e9a4ec1cd3bb_Smile-Logo-RGB.svg (linked by https://smile.id/). A white backing preserves logo contrast in dark mode. This attribution describes identity verification only.

Validation: scoped bank presentation smoke; seller identity consent/session/expiry/privacy regression; browser fixtures at 320, 390 and 1280 pixels in light/dark themes covering saved details after refresh, masking, double-submit/retry, expired and replaced links, shimmers/reduced motion, existing KYC reuse, return CTA, logo loading and contrast, no overflow. Reviewed mobile screenshots. Browser auth/KYC/provider responses are fixtures, not evidence of a new live bank verification or payout.

Bank payout and worker switches remain disabled. No money movement is part of this change.

Focused TypeScript diagnostics passed (36 files); production Vite build passed to an isolated temporary output directory.

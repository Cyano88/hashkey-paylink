# Profile country - 31 October 2026

Developer/admin web scope only. No Pocket app source, build, install or live identity/payment mutation was performed.

## Behaviour

- Personal profiles store residence country; each business profile stores registration country. Supported profile choices: Nigeria, Uganda, United States; Kenya is visibly coming soon and rejected by the write API.
- The country prompt is visible on existing profiles that lack it, including the settings screen. New business profile creation collects name and country together. Country is required before the portal creates a production app or opens its verification UI. Sandbox remains available.
- A login can own multiple businesses in different countries. Owner and profile isolation are preserved. Personal country records use an owner-specific storage key.
- New apps created against an explicit profile require its country server-side. Existing legacy API calls without a builder profile retain compatibility; country metadata is not a payment authorization control.
- Country selection does not change settlement mode, currencies, verification status, keys or limits. It does not grant cross-border payment access. Existing KYC/KYB/provider checks remain mandatory for local settlement. Requested payment markets are distinct from registration/residence country.
- A saved country cannot be silently changed by the client. Request a country change opens the existing support widget without navigating away or discarding app edits. Submitted/approved business verification must match the selected country. New business verification is prefilled from profile country; mismatched saves/submissions are rejected.
- Admin Businesses displays Profile country, residence/registration context and recorded verification state, and filters by country or Country not set. Personal identity status is labeled not recorded unless the project has a recorded verified flag; profile country is never labeled verified.
- Local NGN/UGX settlement shows only the fixed Base network instead of six unavailable choices.

## Verification

Passed real-handler fixture suites: developer-builder-profiles (including separate-country business ownership, immutable country, Kenya rejection, persistence and no approval side effects), developer-verification (including country mismatch), developer-production-access, operations-workspace (including country projection).

Passed browser suites with mocked identity and real in-memory handlers: fresh onboarding and builder profile switching, including 320/390/640/768/1440 light/dark layouts. Existing console and receipt settings browser regressions passed. Playwright checked admin country filtering/mobile width and Base-only local settlement network presentation.

Existing records are not assigned a guessed country. No live country was selected for the user during testing. Deployment status is reported separately.

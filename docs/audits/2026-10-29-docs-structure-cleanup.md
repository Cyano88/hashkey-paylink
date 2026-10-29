# Documentation structure cleanup — 2026-10-29

## Scope

Replaced the mixed current/legacy navigation with three ordered groups: Developer API; Pocket by Hash PayLink; Reference, policies & compliance. The entry page is Build your business on Hash PayLink. Pocket's role in hosted checkout is explained separately from merchant integration.

Removed published documentation and imports for manual payment-link builders, multi-payer/flexible collections, standalone chain guides, 0G archive/agent verification, access mode, older SDK URL helpers, and the mixed wallet-provider setup. Removed agent checkout, Agreements, Arena, internal relay, World Cup and legacy endpoint material from the public API page. Retired URLs redirect to the current entry page; SDK and wallet bookmarks redirect to the current guide/Pocket overview. Product code and historical payment records are unchanged.

Checkout and separate Polymarket funding remain documented. Contract verification used api/checkout-selection.ts, api/hosted-checkouts.ts, api/polymarket-funding-checkouts.ts and the developer configuration. Pocket guides were checked against pocketRoutes.ts, the transfer menu and swap UI. This documentation review is not a new funded test of those routes.

Existing Terms, Privacy and account deletion text is preserved. New business-review guidance does not invent daily limits, bank licensing, deposit insurance or provider approval. Local bank/mobile-money onboarding remains pending audit, AML/KYC controls, daily-limit decisions and provider approval.

## Verification

- Copyable server helper smoke tests passed; no live payment calls.
- Browser checks passed at 320/390/1280 in light/dark for the integration guide, all 14 retained pages at mobile/desktop widths, three navigation groups, mobile menu, removed-route redirects and absence of page errors.
- Desktop/mobile screenshots inspected: output/playwright/docs-reorganized-1280.png and docs-reorganized-390.png.
- Final build and live deployment evidence follows below after completion.

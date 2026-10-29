# Builder integration handoff

The public getting-started guide and the stablecoin checkout console now share one path: save an order, create a checkout on the server, redirect the browser, verify the webhook, confirm authenticated status, and deliver once.

The guide explains business-use examples without promising approval, platform versus merchant responsibilities, server secrets, parent/child checkout identifiers, durable deduplication and fulfillment, recovery, receipts, support and troubleshooting. Local bank/mobile-money onboarding remains pending the flow audit, AML controls, daily-limit decisions and provider approval. Cards and recurring subscriptions are not enabled by this work.

`examples/hosted-checkout/hashpaylink.mjs` is the same helper shown in the documentation. It is not a complete shop; the guide and README specify the required authenticated order routes and durable database adapter.

Validation:
- `node scripts/builder-integration-smoke.mjs`: passed helper contract, retry identity, trusted checkout URL, signatures, stale/tampered events and payment matching fixtures.
- `node scripts/builder-guide-browser-smoke.mjs`: passed actual docs and console component at 320/390/1280 widths in light/dark themes, navigation, expanded code, no horizontal page overflow or page errors.
- Production build verification and deployment are recorded in the release handoff after completion.

No new payment, project, API key or email was created for these documentation tests. The funded Lunchroom acceptance evidence remains in `2026-10-29-web-receipt-release.md`; it does not prove other routes or local-provider approval.

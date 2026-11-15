# Developer portal final flow review

Reviewed release checkout hashpaylink-recovery-release-20261104 after deployed source 9c1197a2257aecba135d22caf4e641e52e1068f8. No new payment, withdrawal, live project mutation, key rotation or external email was performed.

## Verified in this review

- Developer project adapter: name-first inactive drafts, required setup before live keys, project scope, valid network/asset routing and receipt settings persistence.
- Production access: individual verification and business verification gates, client approval forgery rejection and immutable account type.
- Full console browser fixture: four main sections, draft creation, activation payload, grouped developer tools, unsaved webhook guard, legacy links, activity navigation and mobile/dark layouts.
- Fresh-account browser fixture with real handlers and synthetic identity: personal Sandbox default, persisted simulated payments, explicit business setup, isolated profiles and Production app-type inheritance. This does not prove live OTP signup.
- Receipt settings browser fixture: support email/timezone save, mandatory customer receipts and 320/390/1280px layouts in both themes.
- Summary browser fixture: opt-in/out, weekly frequency, reporting timezone and mobile/desktop layouts. Policy/delivery fixtures cover daily/weekly periods, DST, catch-up, owner/seller separation, transfer/revocation, current email, opt-out, suspension, no-activity periods and durable deduplication. Only the test outbox was used.
- Builder integration examples: stable retry key, exact create contract, trusted checkout URL, raw signed webhook validation, session/child correlation, exact amount/asset/network matching and missed-webhook recovery. No live API calls from these tests.
- Developer payment status: authoritative statuses, expiry, in-flight protection, pagination and merchant gross/fees/net reporting.
- Live developer.hashpaylink.com loads the correct sign-in page with no page errors. The browser is signed out; a fresh authenticated production portal walkthrough remains unverified.

The first summary browser run hit sandbox dependency access denial; its approved rerun passed. A redundant preview start found the existing local preview on port 4319; the original preview served the browser checks successfully. Neither was an application failure.

## Corrections and release boundary

Updated stale release/operations documentation: Marketplace is selectable for early-access registration, and daily/weekly summaries are implemented opt-in features. Registration and whitelist review do not bypass activation gates.

The previously completed real Lunchroom cash-balance NGN checkout, signed webhook, merchant order, Pocket activity and successful receipt remain documented in 2026-11-15-lunchroom-pixel-acceptance.md. The internal Marketplace bank withdrawal also completed. Receipt polish is deployed in 44ed5f81e and 9c1197a22 and installed on Pixel: matching bank icons, Marketplace withdrawal title, received amount shown once and a transaction row only when distinct from the receipt reference.

This review found no new failing product behavior in the checked portal flows. It does not establish all payment rails, production summary inbox delivery or general external Marketplace activation. Those must not be inferred from local fixture passes or the single controlled live payment.


## Authenticated follow-up and receipt presentation

Authenticated Chrome review subsequently verified Lunchroom preferences and Marketplace balances. Summaries remain off; no subscription preferences were changed. Live bank quote/execution gates remain off. An expired, unsubmitted Lunchroom attempt incorrectly displayed Processing; commits b3ff6a9c8 and a9cf24d4e corrected the evidence-bound status projection. The live refresh showed that attempt Expired while the completed order remained Paid. No payment or ledger mutation was needed.

The receipt presentation follow-up introduces shared payment icons and email/PDF hierarchy, recipient-specific details, configurable daily/weekly activity summaries, explicit current-balance timestamps, and separate currency totals. Funding summaries are distinct from sales; funding receipts require bound payment and completed delivery evidence. Payer documents omit merchant settlement data. Existing frozen attachments and email deduplication are retained. No historical mail is resent.

Local verification: focused TypeScript (57 files), web source build, receipt policy, all eight checkout networks, email/PDF/idempotency checks, Marketplace audience and notification checks, summary policy/delivery/browser tests, and scoped funding/currency/icon fixtures. Four generated PDFs were rendered and inspected; an extra footer page was fixed. The four example emails were checked at 320/390/1280 pixels with no horizontal overflow. These are local fixtures, not inbox delivery or additional live payments.


Release f7ec5234e became live on Render at 2026-11-15T10:02:12.827799Z (dep-dbso3pdg1s2s73fnl38g); the public bank icon returned HTTP 200. The first native update installed successfully without clearing data and reopened the authenticated home screen. Pixel inspection confirmed the existing bank withdrawal remained Successful with one received amount and matching bank icon; the existing Lunchroom payment remained Successful and identified Wallet payment without exposing merchant settlement. The follow-up removes the native payer's repeated date and uses exact decimal formatting for hosted payment amounts and grouped bank amounts. No payment, email opt-in, or new money movement was performed during this release.

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

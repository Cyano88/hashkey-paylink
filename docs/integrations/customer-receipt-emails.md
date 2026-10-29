# Customer receipt emails

Project owners configure **Setup → Receipts & support** in the developer console and save changes. Set the monitored merchant support email and receipt timezone, then enable customer receipts. Messages use the merchant name via Hash PayLink, the saved merchant logo, and the support address as Reply-To. The verified platform sender remains server-managed.

Initial coverage is human hosted X Layer stablecoin checkout with a Privy-verified purchaser email. Other chains, card payments and subscriptions are outside this release. Enabling does not backfill older payments. A payment must be prepared after the current enable timestamp and subsequently confirmed. Public request bodies cannot supply the email recipient, and public payment responses do not expose it.

Deployment requires a durable store, RESEND_API_KEY, RECEIPT_FROM_EMAIL (or ALERT_FROM_EMAIL), and CHECKOUT_RECEIPT_EMAIL_ENABLED=true. Project settings default to disabled. The existing reconciliation interval prepares emails from canonical paid receipts and drains the durable hashpaylink:checkout-receipt-emails:v1 outbox. Each frozen payload includes a searchable PDF and web receipt link. PNG/JPEG merchant logos are fetched through public HTTPS with pinned DNS and bounded size; unsupported or unavailable images fall back to merchant text.

Delivery uses receipt-based idempotency, atomic leases and bounded retries. An uncertain send older than 20 hours or 12 failed attempts requires review rather than automatic replay. Disabling a project cancels pending emails. A sent job means provider acceptance; inbox delivery needs separate evidence. Support and timezone edits affect newly prepared messages; an already queued payload remains unchanged for safe retries.

Validation: receipt-email-settings-smoke, developer-projects-adapter-smoke, pocket-xpay-api-smoke, checkout-receipt-email-smoke, checkout-receipt-reconciliation-smoke, receipt-email-presentation-smoke, developer-receipts-browser-smoke. Browser coverage includes saving settings at mobile/desktop widths, light/dark presentation and overflow checks. PDF visual inspection confirms a single page and actual merchant logo. Production Vite build passed. Broader TypeScript checking has existing repository errors; the new receipt modules have no remaining diagnostics.

Live activation and a new funded payment remain to be verified after deployment, using a merchant-confirmed support address and user-approved payment.

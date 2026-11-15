# Customer receipt emails

## Developer setup

Open **Settings > Receipts & support** in the developer console. Save a monitored merchant support email and receipt timezone. Customer receipts are automatic for eligible confirmed payments; there is no merchant opt-out. The platform manages the verified sender. Messages use the merchant name via Hash PayLink, its saved branding, and the support address as Reply-To when configured.

Daily or weekly merchant summaries are a separate opt-in, with their own reporting timezone. They go to the verified owner account, not the purchaser. Marketplace operator and seller summaries are scoped separately; account-funding activity is not reported as sales. Summaries do not replace payer receipts.

## Payment and audience requirements

Coverage follows supported human hosted-checkout networks, including the current Circle routes and activated X Layer/BNB routes. A purchaser must have a verified email bound to the exact checkout and paying wallet. Public request bodies cannot choose the recipient. Canonical payment confirmation is required; local settlement or account-funding delivery must also be confirmed where applicable. Customers without that verified binding are not automatically emailed.

Payer receipts show the customer's order/payment information, not merchant net proceeds or seller fees. Withdrawal receipts belong to the withdrawing operator or seller. Match order fulfillment to authenticated payment evidence, not the email, return URL, or merchant bank-credit amount.

Eligibility and activation cutoffs prevent historical backfill. Suspending or removing a project suppresses delivery. Support, timezone, branding and presentation updates affect newly prepared messages; an existing queued payload and its PDF remain frozen for safe retries.

## Delivery and PDF behavior

Production requires a durable store, the configured transactional email provider and verified sender, and the platform receipt-email feature enabled. Reconciliation prepares canonical receipts and drains the durable receipt outbox. Developers do not need to send a second customer receipt.

Each email includes a PDF attachment and one **View receipt** link. The web receipt exposes PDF download through `/api/receipt?id=RECEIPT_ID&format=pdf` on app.hashpaylink.com. A canonical confirmed receipt is required. When the original emailed PDF exists, download serves those exact bytes; otherwise it renders the confirmed receipt. Public responses do not expose recipient or delivery metadata.

Delivery uses receipt-based idempotency, atomic leases and bounded retries. An uncertain send older than 20 hours or 12 failed attempts requires review instead of automatic replay. A sent outbox job establishes provider acceptance, not inbox placement. Do not mark an order paid or fulfilled from email delivery.

## Verification evidence

Receipt settings, checkout reconciliation, payer/funding binding, marketplace audience isolation, summary policy/delivery and browser layout fixtures cover these contracts. Existing Lunchroom acceptance verifies a paid Base USDC checkout with an NGN order, delivered signed webhook and canonical payer receipt. Owner-approved, clearly labelled preview emails with PDF attachments were accepted by the provider without creating transactions. The current send-only provider key cannot retrieve delivery status; inbox placement is not claimed from API acceptance.

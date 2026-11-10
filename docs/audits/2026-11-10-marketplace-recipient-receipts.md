# Marketplace refund activity and recipient receipts - 2026-11-10

## Verified outcome before release

- The existing buyer refund was already present in the durable wallet feed. Pixel activity displayed it after pull-to-refresh; this was a stale client view, not a missing transfer.
- A read-only projection of finalized Marketplace accounting now supplies the explicit Marketplace refund / Marketplace payout context. Matching raw wallet deposits are deduplicated by transaction.
- Live read-only projection returned one buyer refund of 0.03 USDC, at rank 0, with zero refund fee deducted. No money was moved during this task.
- Invalid or incomplete legacy settlement evidence is excluded without suppressing other valid receipts.

## Email behavior

- Base USDC wallet refund and payout receipts use the existing durable, leased email outbox and provider idempotency keys.
- Recipient wallet ownership is resolved from server wallet links. The linked email is confirmed against the current identity provider's verified email account, because older wallet-link records could contain a client-supplied email.
- A project owner's email is never substituted for an unrecognized buyer or seller. External wallets without a verified recipient email are skipped.
- A durable activation timestamp excludes historical settlements. No historical pilot emails were sent.
- Refund receipts show the full requested refund and zero deducted fees. Seller payout receipts show net received, withdrawal fee, and total balance debit.
- Production email flag, sender, provider, and identity configuration were verified present. This is configuration verification, not proof of inbox delivery.
- Rendered refund and payout PDFs were visually checked for clipping and fee clarity.

## Separate developer reporting

The owner prefers a daily batch summary for developers rather than a copy of every recipient receipt. That reporting feature is not part of this change. API/webhook settlement reporting remains unchanged. No new public money-movement gate is enabled.

## Release verification and naming follow-up

- Receipt release 87eff67cb deployed live through Render dep-dbpbo5etlv9c73f4qdcg. Developer portal and health returned 200.
- Production worker activation was confirmed. Both historical pilot receipts remained absent from the email outbox.
- Pixel home showed Marketplace refund, Received, +0.03 USDC after app resume. This verifies receipt visibility, not a general auto-refresh fix.
- The owner's naming correction uses the registered marketplace app name plus Refund/Payout in Pocket. Email subject and PDF details use the same server-owned name. Missing names retain a generic fallback; names are escaped in email HTML.
- The live read-only projection returned Hash PayLink Marketplace Test - Refund exactly once. Focused receipt tests and TypeScript checks passed, including app-name escaping, fee display, owner isolation, and durable email idempotency. Both named PDF variants were rendered and inspected.
- The initial full regression run passed all 37 suites; focused receipt outbox and Pocket adapter tests also passed. No funds or historical emails were sent.

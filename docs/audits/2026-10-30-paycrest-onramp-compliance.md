# Paycrest onramp compliance checkpoint - 2026-10-30

## Identity boundary confirmed by user

Business KYB is separate from normal Pocket customer KYC. Keep three records distinct:
1. Hash Technologies Limited's Paycrest sender KYB: provider onboarding approval, not payer identity for API orders.
2. Builder/project business KYB: reviewed company, beneficial-owner/control-person and business evidence. Internal merchant approval is not Paycrest sender approval and is not automatically the payer.
3. Actual onramp customer: source.kyc personDetails for an individual payer, or organizationDetails and directors for a business payer. Bind to the authenticated payment actor and refund-account ownership.

Paycrest dashboard orders using the sender's approved KYB does not extend to our API-created customer orders. Existing Pocket offramps remain separate. No business KYB was downgraded to personal KYC, no new merchant verification vendor was added, and no onramp route was activated.

## Verified schema and missing handoff

Verified current sender integration guide against the user's forwarded October 14 email:
- Person: entityType person; personDetails.fullName, birthDate YYYY-MM-DD (18+), idDocument.type/number/issuerCountry.
- NGN: guide specifies BVN (type BVN) or NIN (type nationalID), 11 digits, issuerCountry NG. Do not assume a document label from Smile is already a Paycrest enum.
- Organization: entityType organization; organizationDetails.legalName, registrationNumber, registrationCountry and at least one director with qualifying personDetails. tradingName optional.
- KES phone and amount requirements do not activate Kenya support in our app.
- Own-account and director payment exceptions require verified customer/director binding; never copy the recipient's KYC into the payer field.

Current Pocket v3 Job stores legal name and an identity-match HMAC but not recoverable birth date and identity-document number. That is not enough to construct source.kyc. A hash cannot be reversed into identity evidence. A verified, consented server-side retrieval/storage handoff and approved retention policy remain necessary; this checkpoint does not accept raw browser KYC as verified or expand sensitive-data storage.

## Backend changes

- Polling and signed webhook handling persist status_detail and recognized refund_reason values.
- Recognize payment_order.compliance_hold by event even when data.status remains pending.
- Retain a known hold when later pending polls omit informational statusDetail.
- Bank-send orders under review cannot regress to expired/cancelled/failed/initiated. Settled/refunded outcomes clear the hold; late holds do not reopen a terminal order.
- Bank-fund API exposes statusDetail, refundReason, a do-not-pay-again message and no expiry timestamp while held. No new UI entrypoint or inactive manual-address rail was enabled.

This is backend state handling, not a claim that every retained legacy UI is ready for onramp launch. End-to-end payer KYC/KYB, account binding, review presentation and real compliance/refund acceptance remain open.

## Tests

- paycrest-compliance-state-smoke: actual signed handler and poll path with isolated durable store, invalid-signature rejection, pending-with-hold event, missing detail preservation, held expiry rejection, terminal outcomes, both refund reasons and late-event safety. No external provider calls.
- paycrest-order-state-smoke: existing terminal regression/replacement isolation.
- pocket-bank-fund-adapter-smoke: existing ownership/funding boundary plus held API response and refund reason.
- paycrest-fee-payer-smoke and paycrest-reconcile-policy-smoke: unaffected payout policy regression.

## Sources

- User-forwarded Paycrest operations email dated October 14, 2026; requirement evidence, not account approval evidence.
- https://docs.paycrest.io/implementation-guides/sender-api-integration#on-ramp-customer-kyc
- https://docs.paycrest.io/concepts/transaction-lifecycle#compliance-holds

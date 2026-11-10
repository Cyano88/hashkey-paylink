# Marketplace Payments production readiness audit - 2026-11-10

## Decision

Do not enable external production yet. The narrow Base USDC internal pilot proves real collection, a wallet payout and a partial buyer refund, but does not prove a developer can integrate and receive automated settlement notifications end to end. Keep the public money-movement gates closed while the launch blockers below are closed.

## Evidence reviewed

Reviewed Marketplace authorization, instruction boundary, runtime composition, collection observer, accounting/backing, wallet custody and reconciliation, refund/payout workers, cancellation, fee handling, webhook outbox, receipt projection and email delivery wiring. Reviewed server route/worker mounting and public docs. Re-ran all 38 Marketplace/related smoke suites: all passed. Fixtures remain distinct from live results.

Read-only production audit:

- Instructions, collections, wallet-worker and refund-worker rollout flags are false; project allowlist is empty. The bound-checkout collection observer is independently installed for reconciliation.
- The pilot collection is finalized. Wallet execution includes two expired attempts and one settled transfer. Refund execution includes one definitively failed attempt and one settled refund.
- Finalized holding balance: 1.053596 USDC. Recorded obligations: 0.053597 USDC. Shortfall: 0; backing blockers: none at the verified snapshot.
- Three pilot events are pending with zero webhook attempts: payout settled, refund failed, refund settled. No live developer webhook acceptance has been established.
- Production receipt worker activation and exclusion of both historical settled pilot receipts were previously verified. Email configuration and a verified buyer email were checked read-only; no inbox-delivery test was performed.
- No funds or historical emails were sent by this audit.

## Confirmed issues fixed

1. Pocket receipt repeated the receiving wallet under To and Destination. Marketplace receipts now use one To field; generic receipts omit an identical destination while retaining distinct bank/destination details.
2. Pocket receipt narration stayed generic after the activity label was renamed. Receipt type is now Refund/Payout with a dedicated Marketplace row using the registered app name. The backend supplies the name through the existing merchantName field; current cached named context remains compatible.
3. Shared web bank status could treat verified funding handoff as successful bank delivery. Handoff now stays pending until settlement; funded failed/rejected/cancelled outcomes remain payout incomplete pending reconciliation. This aligns the web status policy with the native policy; it does not alter financial accounting.
4. Marketplace receipt display rounded exact micro-unit payout/fee figures. The settlement receipt now preserves up to six meaningful decimals, retaining a minimum two for ordinary stablecoin values. 1.50000 becomes 1.50; 0.016403 and 0.003597 remain exact.
5. Receipt tests contained stale expectations about funded bank failure and wallet Type/Direction. Corrected them and added explicit pending-handoff and unfunded-failure checks.
6. Public docs and the implementation contract still described the internal funded pilot as unperformed. Updated the current status and identified older implementation checkpoints as history.

## Launch blockers and closure criteria

| Priority | Gap | Required closure |
| --- | --- | --- |
| P0 | External financial API is not mounted; general rollout gates are off. Internal methods are not an integration API. | Mount a narrowly allowlisted authenticated Base USDC API with project isolation, per-request revocation, idempotency, destination verification and documented request/response behavior. Prove it through an external developer key, not internal pilot scripts. |
| P0 | Wallet/refund execution and webhook retry are not scheduled as a production service. Pending pilot events have zero delivery attempts. | Wire bounded, restart-safe workers and independent webhook draining; add observable retries, expired leases and dead-letter handling. Verify signed delivery and consumer deduplication against an explicitly configured test endpoint. Historical event replay requires deliberate review. |
| P0 | The pilot seller recipient was the configured Bills treasury address and was disputed by the owner. That is not acceptance evidence for a real merchant destination. | Confirm the intended test seller identities and wallet addresses before any new transfer. Then perform an explicitly authorized multi-seller canary, fee/commission reconciliation and buyer partial refund through the developer API. Do not silently reuse the disputed wallet. |
| P1 | Receipt emails only cover currently verified linked Pocket recipient emails; external seller/buyer wallet contacts are not enrolled. Inbox delivery has not been observed. | Decide and document the external-recipient contact/consent contract, implement verified recipient enrollment if required, and run an authorized delivery canary. Never send the buyer/seller receipt to the developer as a fallback. |
| P1 | Operational acceptance is incomplete. | Establish monitored backlog/unknown-state/backing alerts, provider outage and restart procedures, and a named process for reconciliation and dead letters. Verify these before unattended operation. |

## Explicitly outside the first launch

- USDT wallet settlement and NGN marketplace payouts do not have a completed authorized live canary. Keep them unavailable for the Base USDC launch. NGN additionally requires verified seller account ownership and confirmation of the provider's marketplace disbursement scope; account-name resolution alone is insufficient.
- Developer daily summaries are a requested reporting follow-up, not implemented. They do not replace signed webhooks or block the correctness of an otherwise complete Base USDC API.
- A holding wallet is used; no smart-contract escrow claim is supported.

## Receipt verification and release scope

The original erroneous receipt was inspected on the connected Pixel. The native build comes from C:/Users/USER/pocket-play-update-20261101, whose source-lineage check passed; the recovery Git checkout is not the native build source. The native receipt fix was built and installed as the same debug app without clearing data. The corrected receipt was subsequently verified on the connected Pixel: Refund, Hash PayLink Marketplace Test, 0.03 USDC, one To row, no duplicate Destination/Narration, and Fee deducted 0.00 USDC.

The actual receipt component passed automated browser checks at 320px and 426px: registered app name, exact refund amount, one recipient, no duplicate destination/narration, back/reopen, no horizontal overflow and image/PDF generation. Screenshots and exported image were inspected; the PDF export is one page. Test artifacts use synthetic addresses and do not constitute another payment.

Bank handoff, receipt policy, bank receipt refresh, activity grouping and focused TypeScript checks pass. The native production web build and Android debug build pass. The native test install is not a Play Store release. Public activation is a separate decision after the P0 closure criteria above are met.

## Follow-up blocker closure - Pixel and runtime wiring

The Base USDC REST boundary is now mounted behind the existing financial gate. New tests cover real HTTP credential authentication/revocation, project isolation, idempotency, forbidden scope overrides and provider-error redaction. A service-level test exercises signed beneficiary ownership, payment creation, release, quoting, payout reservation, refund-fee funding, original-payer refund and cancellation.

Recurring wallet/refund workers and independent leased webhook delivery are mounted, default closed. Gas coverage now requires a bounded, current operator-reviewed record and finalized canonical EntryPoint evidence. Historical webhook events are excluded at activation; founder-approved replay preserves event identity and attempt history. Founder-only operational status exposes unknown operations, expired quotes, backing and webhook backlog. Read `../marketplace-api-operations.md` for exact API and recovery procedures.

Validation: 41 Marketplace/related suites passed, plus the founder recovery suite (42 total); focused TypeScript checks passed for 26 files. These are fixture results, not additional live payments or notification delivery. Pixel verification is complete.

Remaining launch acceptance: confirmed seller wallets and authorized multi-seller API canary; current provider gas-policy approval and bounded coverage record; explicit webhook/email test destinations and observed delivery; operational alert routing/on-call ownership and restart/outage acceptance. Financial and notification activation remain closed. No disputed recipient is reused and no additional funds or notifications were sent. External-recipient email enrollment and developer daily summaries are not implemented; first-launch receipt email support is limited to verified linked Pocket recipients.

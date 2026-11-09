# Marketplace Payments - implementation contract

Status: foundation under development; not a production or public sandbox integration.
Capability: marketplace_payments. Initial network: Base. Assets: USDC and USDT, accounted for separately.

## Settlement comes first

| Choice | Funding and balance asset | Recipient destination | Execution |
| --- | --- | --- | --- |
| Cash balance | Base USDC | Verified NGN bank account | Paycrest quote, USDC funding, verified settlement |
| USDC on Base | Base USDC | Verified Base wallet | Same-asset transfer after release |
| USDT on Base | Base USDT | Verified Base wallet | Same-asset transfer after release; no local settlement |

Cash balance is local settlement, not the name of a marketplace stablecoin ledger. No implicit token conversion. A payment has one asset: any bank allocation requires USDC. USDT-only payments may allocate to Base USDT wallets. Mixed currencies need separate payments or an explicitly added conversion product, not ledger relabeling.

## Ownership and accounting

The marketplace owns stores, seller identities, delivery conditions, commissions, disputes and its customer-facing balance UI. Hash PayLink must own the authoritative money records and execution. Scope seller IDs, beneficiaries, orders, commands and reads to the authenticated developer project; never trust a body-supplied project ID.

Each payment snapshots seller allocations and an explicit platform-commission allocation. Amounts use exact integer micro-units; allocations must sum to the collected principal. Hash PayLink/provider fees are separate from marketplace commission and require an explicit payer and quote binding before live execution. Do not silently reduce a seller allocation.

Draft creation credits nothing. Verified collection into the holding mechanism credits pending allocations. Release moves an explicitly authorized amount to available. Payout reserves available funds; refund reserves unspent pending/available allocations. Unknown external outcomes stay reserved. Only proven failure returns the exact source buckets; verified settlement moves the amount to paid/refunded. Refunds specify whether the platform commission is returned; it is never inferred. Already-paid funds cannot be clawed back through a ledger mutation.

A seller's view aggregates allocations within one project and one asset. It never combines USDC and USDT or personal Pocket balances. A per-seller ledger account does not require a per-seller on-chain escrow contract.

## Proposed API surface (not mounted or callable)

- Seller/beneficiary registration and verification: bind owner, project, bank or chain/address and settlement asset.
- Payment creation: order reference, Base asset, exact amount, allocation IDs, seller IDs, commission, beneficiary references and idempotency key.
- Payment and seller-balance reads: authenticated project scope, separate asset balances, operation history.
- Release instruction: original payment, allocation IDs and exact amounts. Marketplace supplies its business evidence reference; the server enforces authority and financial availability.
- Payout instruction: eligible allocations, immutable destination, same-asset route or accepted Paycrest quote. Fee, quote expiry and requested debit bind to the reservation before funding.
- Refund instruction: original payment, exact allocation amounts and original verified payer. Arbitrary refund destinations are not accepted.
- Operation reads/webhooks: submitted is not settled. Unknown, failed and settled outcomes come from verified execution/provider evidence. Signed notifications use a durable outbox; consumers deduplicate event IDs and retrieve canonical status.

The internal repository is not an authentication boundary and must never be directly exposed as an arbitrary command endpoint. Funding/result commands are for trusted verification adapters only; a developer must never credit funds or declare a payout settled.

## Reuse and implementation boundary

Reuse project identity/scoped keys and status checks, exact Base token identity, payment proofs, atomic durable-store mutation, signed webhook conventions, receipts and recovery patterns. Reuse Paycrest's quote-to-settlement adapter after marketplace release, not its immediate checkout funding behavior. Reuse reviewed agreement concepts; do not restore retired PayStream routes or ghost-address/manual-deposit rails.

Implemented now:
- Shared settlement contract and disabled developer product; production capability filter and onboarding rejection.
- Public docs explain destinations before integration and explicitly mark availability.
- Exact allocation validation and internal transitions for funding, release, payout/refund reservation and verified-result recording.
- Atomic durable repository adapter, project-scoped idempotency, cross-payment proof reuse rejection, seller balance reads and command journal.
- Unmounted instruction service with a closed default gate, injected trusted credential resolution, explicit marketplace read/release scopes and per-call revocation checks. No production credential resolver is wired.
- Atomic multi-allocation release with a credential and business-reference journal. Requests cannot supply a project override, funding evidence, settlement status or destination. Internal proof references and journals are excluded from instruction-service read responses.
- Fixture coverage for isolation, conservation, concurrent reservations, restart, partial refunds, unknown outcomes, same-asset rules and disabled product access.

Required before activation:
1. Select and verify the actual custody/holding contract or account model. Existing direct merchant settlement is not escrow.
2. Bind canonical chain/token/holding recipient/payer/amount/log evidence to collection and prevent replay across all collection consumers.
3. Add owner-verified beneficiaries and wire marketplace-specific scopes to actual credential issuance/resolution. The internal scoped instruction service is implemented; public handlers remain unmounted.
4. Implement signing/execution adapters, leases/idempotency, chain finality and provider reconciliation. Unknown broadcasts must not be treated as safe failures.
5. Bind Paycrest quotes/fees/debits and refund destinations; confirm provider approval for marketplace seller disbursements rather than inferring it from existing merchant settlement.
6. Add transactional webhook outbox, receipts and backing/liability reconciliation. The initial single durable-book store is a foundation, not a production-scale accounting design.
7. Validate live funding, split releases, both wallet assets, NGN payout, partial refunds and restart/timeout recovery using authorized canaries before enabling integrations.

Fixtures use synthetic funding and settlement evidence. No production custody, signing, provider payout, public marketplace execution endpoint or live-funded escrow is enabled by this change.

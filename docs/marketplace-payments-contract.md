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

## Wallet beneficiary implementation checkpoint

The internal repository now supports five-minute, single-use EOA wallet-control challenges. The signed message binds the project, seller reference, immutable beneficiary version, Base chain ID, asset, address, random nonce and validity window. Verification is local signature recovery; it does not send a transaction. Contract-wallet signature verification is not implemented.

`createWithVerifiedWallets` atomically validates active matching beneficiaries and snapshots their destinations when creating a payment draft. A changed destination needs a new beneficiary reference and fresh verification. Revocation blocks new bound payout reservations without changing historical snapshots. Retrieving a snapshot is not proof that it remains eligible for execution; the eventual worker must revalidate revocation before signing and reconcile any transaction already submitted.

These methods are trusted internal repository methods, not developer endpoints. The caller must establish project/seller authority; a wallet-control signature does not establish legal identity or marketplace seller ownership. Production registration authorization remains unwired. The original unbound `create` method remains foundation/fixture infrastructure and must not be used as a production bypass.

The wallet-only creation method rejects bank allocations. The general verified-beneficiary method now supports banks only when the separate ownership verifier is configured. No account-name lookup is represented as seller ownership verification, and no USDT-to-bank route is introduced.


## Bank beneficiary and payout preparation checkpoint

`createMarketplaceBankVerifier` reuses the Paycrest account-name lookup but requires a separate trusted seller-ownership verifier. It has no default ownership implementation. That verifier must bind the project, seller, resolved institution and full account number; it cannot trust identity claims submitted by the marketplace request body. Production identity verification and registration authorization remain unwired.

Bank details (including holder name) use AES-256-GCM with a dedicated 32-byte key, key version and authenticated project/seller/beneficiary context. Stored records contain encrypted details, a keyed destination digest and last four digits. Registration responses exclude ciphertext and ownership evidence. Key provisioning and rotation still need operational integration; no runtime secrets are created by this implementation.

`createWithVerifiedBeneficiaries` snapshots active matching wallet or bank versions in one transaction. Bank versions cannot replace wallet versions or pending wallet challenges with the same project/reference. Revocation blocks new bound payout reservations. Existing historical snapshots remain unchanged.

`prepareMarketplaceBankPayout` is an internal, read-only preparation step: released Base USDC only, NGN precision of at most two decimals, explicit total debit and maximum fee budget, matching destination and holding refund address. It returns sensitive ephemeral provider-request material and must never be returned from a developer endpoint or written to a journal. The holding refund address must come from the eventual trusted custody configuration, not caller input. Preparation does not validate that custody configuration itself.

No provider order is created and no funds are reserved here. A live adapter must still bind the actual returned quote, fees, expiry, funding address, destination and provider order ID to an atomic reservation, recheck eligibility before signing, and reconcile unknown outcomes. The existing Pocket merchant source/fee policy must not be silently reused as marketplace disbursement authorization. USDT remains wallet-only.

## Quote acceptance and atomic bank reservation checkpoint

The unmounted instruction service now supports an explicit `marketplace:payout` scope. Its bank reservation request contains only payment ID, quote ID and business reference. Project and credential identity come from the trusted resolver; amounts, destinations, funding evidence and settlement status are not accepted from that request. Authorization is rechecked on retries.

`reserveBankPayout` requires an injected trusted quote resolver; no production resolver is installed. The normalized resolver contract must come from the persisted provider-order creation request, the actual Paycrest response, the accepted fee budget and verified holding configuration. The validator enforces consistency but cannot establish the truth of fabricated adapter input. It must never be wired to request-body quote data or arbitrary existing Pocket orders.

New reservations require exact Base USDC token identity, matching NGN amount, exact debit/funding equality, net plus fees equal to debit, fees within the accepted ceiling, an initiated/unsubmitted order, a matching active beneficiary and more than 90 seconds remaining. Expiry and beneficiary eligibility are checked inside the atomic repository mutation. Fee payer is explicitly the allocation: the reserved debit includes all quoted fees, with no extra implicit balance deduction.

The sanitized quote, holding identity/revision, authorization and ledger reservation commit together. Provider order/intent/quote references cannot fund two operations. Existing reservations are immutable: a same-key retry retrieves the original quote and current operation status even after quote expiry. It does not resolve a replacement quote, debit again or authorize an expired broadcast. Changed request identity fails. Unknown outcomes retain the reservation; expiry alone does not return funds.

The developer response omits internal provider/holding references and proofs. Raw provider payloads, account details and credentials are not persisted in quote records. No public route, provider-order creation, signing, broadcast or reconciliation worker is enabled. Before signing, the eventual worker must revalidate the actual provider order, holding revision, beneficiary eligibility and expiry. A quote reservation is not settlement.

## Bank execution coordination checkpoint

`bankExecution` is an internal coordinator, not a signer or running worker. It claims an already reserved bank payout with a random attempt ID/token and a 30-second lease. Concurrent claims are serialized. Only an expired claim that never began submission can be replaced; replacement records the earlier attempt as expired and rejects its token.

`beginSubmission` requires a configured trusted preflight adapter, absent by default. That adapter must refresh the provider order, verify holding identity/revision and current payout authority. The normalized quote must exactly match the accepted quote. Preflight older than five seconds is rejected; lease, expiry, operation state and beneficiary revocation are checked again during the atomic mutation.

Before returning a submission handoff, the coordinator persists an attempt marker and changes the ledger operation to unknown, retaining its reserved funds. Once this commits, no worker can claim or begin submission for that operation again. If the process crashes before calling the signer, the conservative result is still reconciliation rather than resubmission. The eventual worker must submit promptly, reject a stale handoff, and never treat this record as perpetual authorization to sign after quote expiry or a custody change.

Transaction hashes are recorded as submission references only, bound to one attempt/payout. A different hash for the same attempt or a hash already bound to another payout is rejected. A timeout can record an uncertain outcome but cannot restore available balance. Verified funding/settlement or definitive failure must come from future reconciliation adapters. No signer, broadcast, automatic retry, running worker or public endpoint is enabled by this coordinator.

## Bank outcome reconciliation checkpoint

The internal `bankReconciliation` service requires a trusted `verifyBankOutcome` adapter, absent by default. Its input is the accepted quote and submission attempt, not a caller-selected terminal status. The eventual adapter must verify canonical chain funding/return evidence and authoritative provider settlement, including finality, exact destination/amount and absence of a remaining executable payout. Normalized evidence fields are a contract for that verifier, not independent proof that it has run.

Settlement requires the exact NGN payout and USDC funding amount. A failed payout restores the entire reservation only for definitive reverted funding with no bank payment, or for the full USDC debit returned with no bank payment. A partial return, withheld fee, timeout or provider failure label cannot release the entire balance through this path. Such outcomes remain reserved for additional reconciliation. Returned seller payout funds are restored to available; this is not a buyer refund.

Evidence is scoped to project, payment, operation, submission attempt, provider order, beneficiary digest and holding revision. Funding transaction and evidence reuse are rejected. Final outcomes are immutable; duplicate identical evidence is idempotent, while conflicting evidence fails for review. Once final, late execution acknowledgements cannot change the attempt back to submitted/unknown. Generic repository result commands cannot finalize quote-bound bank payouts.

The terminal ledger transition, execution state, sanitized evidence and pending payout event commit atomically. A failed commit leaves all unchanged; replay creates no duplicate event. Events contain project/payment/operation references, debit and NGN result, not bank account details, holding credentials or raw provider payloads. The ledger paid bucket tracks the consumed USDC debit including accepted fees; the event's NGN amount records the bank payout separately.

The pending event queue is not a delivered webhook. A signed delivery worker, subscription configuration, delivery retries and acknowledgements remain to be implemented. There is still no production verifier, signer, bank payout or exposed reconciliation endpoint.

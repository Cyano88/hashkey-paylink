# Arc Agreements architecture

## Product boundary

Hash PayLink exposes programmable USDC agreements as infrastructure. Hash
PayStream will be the first standalone client built on that public API, not a
second developer platform.

The initial release is deliberately limited to durable testnet drafts. It
defines the API, ownership, validation, and idempotency boundary without moving
funds or representing that an onchain agreement is active.

## Canonical objects

- **Offer** describes what a person or agent can buy.
- **Agreement** records the parties, value, release template, and lifecycle.
- **Access grant** records access delivered after verified completion.
- **Receipt** records the authoritative money movement or release proof.

Only `Agreement` drafts are implemented in the first foundation phase.

## Project isolation

Human and agentic projects remain separate. An agreement inherits its
project's immutable checkout mode and API-key environment; a request cannot
switch either value.

- Test keys may create Arc Testnet agreement drafts.
- Live keys cannot use this preview API.
- A project must explicitly enable the `arc_agreements` capability.
- Agreement data is isolated by developer project.

## Templates

### Fixed unlock

One amount for one deliverable or access grant. No release schedule is
accepted.

### Progressive release

An ordered list of cumulative completion percentages. Percentages must
increase and end at 100.

### Milestone

Up to ten named milestones. Their release percentages must total 100.

## Current lifecycle

The preview endpoint creates only:

`draft`

It returns `activationStatus: contract_unavailable`. It does not deploy a
contract, generate a deposit address, create a checkout, issue access, release
funds, or emit a payment receipt.

Future lifecycle states may include `awaiting_funding`, `funded`, `active`,
`completed`, `refunded`, and `cancelled`, but they must not be exposed until the
contract is deployed and verified, the reconciliation worker is operational,
and the complete activation path has passed review.

## API foundation

- `POST /api/v2/agreements` creates an idempotent draft.
- `GET /api/v2/agreements?id=agr_...` reads a draft owned by the API-key
  project.
- `X-API-Key` selects the project, mode, network policy, and environment.
- `Idempotency-Key` is required for creation.

The durable record stores a request hash so reuse of an idempotency key with a
different request is rejected.

Each draft also stores a domain-separated `termsHash`, a project-scoped
`clientReference`, and the normalized contract schedule. The terms commitment
binds the template, resource, customer-visible copy, amount, recipient,
schedule, duration, and cancellation window. The client reference keeps
identical developer order identifiers isolated across projects.

Multi-step drafts are rejected when six-decimal USDC rounding would produce a
zero-value release. The contract independently enforces the same condition.

A read-only reconciliation adapter compares those durable terms with immutable
escrow state and rejects chain, party, token, timing, schedule, commitment,
progress, or principal-balance mismatches. This is an audit boundary only; the
preview endpoint continues to return `contract_unavailable`.

Confirmed reads are pinned to a block behind the configured Arc head. Verified
states enter a durable webhook outbox with a stable state-derived event ID,
leased delivery, bounded retry, and the existing developer-project HMAC
signature. The server drains this durable outbox and its signed retry behavior
has passed a controlled external test. It is not connected to a public
activation route or a production reconciliation worker, so the preview emits
no agreement webhook.

The activation policy module is a non-broadcast safety boundary for the future
payer flow. It requires explicit project and checkout-mode allowlists, pilot
amount and duration ceilings, reviewed runtime addresses, operator
configuration, and a signed developer webhook. It cannot activate an agreement
by itself.

## Contract and migration gates

Before funding or activation can ship:

1. Design a new Arc-native contract that does not depend on pre-funded ghost
   addresses.
2. Threat-model funding, authorization, expiry, cancellation, partial release,
   refunds, replay protection, and recovery.
3. Add indexed reconciliation and signed webhook events.
4. Complete contract tests and an independent security review.
5. Prove the standalone Hash PayStream client has public-API parity.
6. Preserve legacy identifiers and a rollback path before removing the
   embedded app.

`modules/streampay` remains a compatibility source during this migration; it is
not the specification for the new custody or funding layer.

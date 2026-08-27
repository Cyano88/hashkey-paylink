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

The durable activation-attempt module prepares exact zero-value payer calls for
USDC approval and factory activation, but it has no signing authority. It
stores one immutable, payer-identity-bound commitment per agreement, rejects
transaction-hash reuse, and accepts an activation only after confirmed
allowance, factory mapping, and escrow-state reads match that commitment. It
accepts either an exact direct payer transaction or an exact single-call Circle
smart-wallet envelope; arbitrary batches are rejected.

The private payer adapter requires the per-agreement access capability, verified
Privy identity, current project policy, and a server-verified linked Circle Arc
wallet. Its review page presents terms before wallet connection. Circle's
user-controlled SDK owns confirmation; Hash PayLink never receives a payer
signing key.

Circle challenge creation is journaled inside the durable activation attempt.
A reservation is committed before the challenge reaches the payer and binds
the exact stage, wallet, deterministic provider idempotency key, challenge,
provider transaction, and eventual Arc hash. A new authenticated Circle session
can recover an accepted delayed transaction after browser or process restart;
the recovered hash still passes the exact smart-wallet call verifier before it
becomes a submitted activation transaction. Provider identifiers remain
server-only.

The master switch stops preparation and admission of newly discovered
transactions. Provider recovery may journal a delayed hash while paused, but
cannot promote it into the activation state. Read-only confirmed-chain
reconciliation continues only for transactions durably admitted before the
pause.

The server now runs that submitted-activation reconciliation as a separately
gated durable worker. It claims only `approval_submitted` and
`activation_submitted` attempts, uses expiring per-attempt leases across
processes, retries RPC failures with bounded backoff, and resumes on process
startup. It intentionally derives project ownership from the immutable
admitted attempt rather than an active API key: revoking a key may stop new
work, but cannot make a previously submitted onchain transaction disappear.
`ARC_AGREEMENT_RECONCILIATION_WORKER_ENABLED` controls this read-only recovery
worker and does not override `ARC_AGREEMENTS_ENABLED`.

A second independently gated worker discovers lifecycle changes for every
active escrow in the durable activation registry. It reads a complete snapshot
at the confirmed block boundary, verifies the immutable parties, terms,
schedule, progress, and remaining principal, and emits a stable event only when
the verified lifecycle changes. Active step releases, completion, cancellation,
refund, and confirmed-block expiry are covered. An expired escrow continues to
be polled until its onchain refund or another terminal state. Durable
per-escrow leases prevent concurrent Render instances from processing the same
record; stale lease holders cannot overwrite newer observations. RPC and
configuration failures use bounded retry and never manufacture an event.
`ARC_AGREEMENT_LIFECYCLE_WORKER_ENABLED` controls this read-only discovery and
does not enable payer activation or operator execution.

Activation admission also derives project capacity from the durable attempt
registry. Capacity is reserved atomically before a Circle activation challenge
is issued, so concurrent payer confirmations cannot broadcast beyond the
project limits. A recorded transaction atomically replaces its reservation;
direct transaction admission passes the same locked check. The active limit
counts challenge reservations, pending activation submissions, verified
non-terminal escrows, and ambiguous reconciliation failures. Confirmed
transaction reverts do not consume capacity; completed, cancelled, and
refunded lifecycles release the active slot. Daily volume counts reservations
or non-reverted activation submissions by their UTC admission day without
double counting, including agreements that later become terminal. Idempotent
replay of the same challenge or transaction adds nothing. Required pilot
settings are `ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT` and
`ARC_AGREEMENT_DAILY_VOLUME_USDC`, with hard code ceilings of 100 active
agreements and 10,000 test USDC per project per UTC day.
These environment settings are legacy-project defaults. Once Operations stores
an approved Arc pilot on a project, its durable limits are authoritative up to
the same hard code ceilings.
A definitive Circle failure with no provider transaction identity or Arc hash
releases its reservation. Ambiguous provider failures keep the reservation
and block replacement activation challenges until transaction recovery and
confirmed reconciliation resolve the exposure.

Operator releases and cancellations use a separate durable action registry and
an independently disabled state-changing worker. Request creation stores the
exact prepared Circle contract execution, evidence reference, non-zero
evidence hash, and a domain-separated request hash. A second operator identity
must approve that unchanged hash before the action becomes claimable. The
registry permits only one reviewed, submitted, chain-pending, or
manual-review action per agreement.

Before first submission the worker re-verifies the active escrow at the
confirmed Arc boundary, the next release step, expiry for releases, immutable
deployment commitment, and Circle operator-wallet ownership. Circle's UUID v4
idempotency key makes a replay after an interrupted HTTP response safe. After a
Circle transaction id is durable, recovery polls that transaction instead of
submitting a replacement. Completion requires exact Circle transaction
metadata plus the successful Arc transaction, exact calldata, confirmation
depth, reconciled escrow snapshot, and expected lifecycle transition.
`ARC_AGREEMENT_OPERATOR_WORKER_ENABLED` is not implied by public activation or
either read-only worker. It remains false. The Privy-allowlisted Developer
Operations route can create an immutable evidence-bound request and record an
independent review, but it cannot execute an action itself. Requester and
reviewer Privy identities must differ. The UI omits Circle challenges,
provider transaction identifiers, wallet ids, idempotency keys, and payer
identity hashes, and provides no blind retry for ambiguous actions. Only the
separately gated worker can submit or recover the exact reviewed Circle call.

Payer cancellation and expiry refund use the same private agreement
capability, Privy payer identity, verified Circle Arc wallet, and user-owned
Circle confirmation flow as activation, but they have a separate durable
lifecycle journal. The server prepares only `cancelByPayer()` while the
confirmed cancellation window remains open and no release has started. It
prepares `refundExpired()` only once the confirmed block timestamp reaches
expiry. The wallet signs the exact smart-wallet envelope; Hash PayLink holds no
payer key.

Challenge creation is controlled by
`ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED`, independently of
`ARC_AGREEMENTS_ENABLED`. This prevents a pause on new agreements from
silently becoming a custody lock on existing escrows. Restart recovery binds
the same Circle challenge and provider transaction, and no replacement action
is permitted while a provider identity or Arc hash is ambiguous. Finality
requires the exact Arc transaction and receipt, confirmation depth, immutable
snapshot reconciliation, and the contract's cancelled or refunded state.
Only safe eligibility and public action status reach the payer UI; Circle
challenge and provider transaction identifiers remain server-side.

The first invite gate is stricter than the general pilot policy. It permits
exactly one managed human-checkout project with an active test key, signed
webhook, Arc Agreements capability, and Arc Testnet recipient. Its envelope is
one active agreement, no more than 1 test USDC per agreement or per UTC day,
no more than seven days, the reviewed factory and operator, a verified Circle
operator wallet, a private Arc RPC, and at least five confirmations. The
read-only invite preflight refuses to run while activation or any worker switch
is enabled.

Hash PayStream's pilot webhook receiver is a separate root API integration,
not a new feature inside the embedded legacy StreamPay module. It verifies the
exact signed raw body, timestamp, event id, project id, agreement id, event
name, and Arc Testnet network before durably recording the event. Stable
identical retries are idempotent; same-id payload drift is a conflict. Receipt
of an event is not authority to release escrow or fulfill a separate product
action.

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

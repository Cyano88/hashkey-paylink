# Arc Agreements activation audit

## Audit result

Arc Agreements remains inactive and draft-only.

The reviewed Arc Testnet factory, controlled lifecycle, confirmed-chain
reconciliation, operator ownership, and durable signed-webhook retry path have
all passed controlled tests. Those results prove the deployed contract and
supporting primitives; they do not create a safe public payer activation flow.

`ARC_AGREEMENTS_ENABLED` is intentionally not read by the draft endpoint.
Changing an environment variable alone cannot deploy, fund, or activate an
agreement.

## Controls now available

`authorizeArcAgreementActivation` is the single fail-closed policy boundary for
a future payer-signing activation route. It does not submit a transaction.

It requires:

- the explicit master switch;
- the exact reviewed Arc Testnet factory and immutable operator;
- at least five confirmation blocks;
- an explicit developer-project allowlist;
- an explicit human and/or agentic checkout-mode allowlist;
- a configurable pilot amount ceiling, capped in code at 1,000 test USDC;
- a configurable duration ceiling, capped in code at 30 days;
- a verified Circle test API-key shape, registered entity secret, and dedicated
  operator-wallet UUID;
- an active test-key project with Arc Agreements, Arc USDC routing, and a
  configured signed webhook;
- an agreement recipient equal to the project's reviewed Arc recipient.

The policy returns a prepared immutable deployment commitment only. It cannot
approve USDC, call the factory, release funds, cancel an escrow, or send a
webhook.

The internal activation-attempt state machine now persists that commitment,
binds it to a domain-separated authenticated payer identity, and stores the
exact payer calls before any transaction is accepted. It verifies the Arc
chain, direct payer transaction or exact one-call Circle smart-wallet envelope,
target, calldata, zero native value, and globally unique transaction hash.
Approval becomes usable only after a confirmed allowance read. Activation
becomes authoritative only after the confirmed factory mapping and complete
escrow snapshot reconcile with the durable commitment.

The kill switch blocks recording new payer transactions. It deliberately does
not block read-only reconciliation of an already-submitted transaction, because
pausing must not make an ambiguous onchain payment invisible. A confirmed
activation is marked active only after its deterministic signed webhook event
has entered the durable outbox.

The private payer route is mounted behind a high-entropy per-agreement
capability, verified Privy identity, the current project policy, and a
server-verified linked Circle Arc wallet. It prepares an exact Circle
user-controlled challenge; confirmation remains in Circle's authenticated
payer SDK and the backend has no payer signing key. The accompanying payer page
shows the terms before wallet connection and submits only the exact approval
and activation challenges.

Each Circle confirmation is reserved inside the durable activation attempt
before it is returned to the payer. The reservation binds the stage, wallet,
sequence, deterministic provider idempotency key, challenge id, provider
transaction id, provider state, and eventual transaction hash. If the browser
or server restarts after Circle accepts a confirmation, a freshly verified
Circle session can recover the provider transaction and pass its hash through
the same exact onchain verifier without asking the payer to approve twice.
Challenge and provider identifiers are never returned by the review endpoint.
If the master switch is off, the recovered hash remains journaled but is not
admitted as a new activation transaction until the safety boundary is
deliberately re-enabled.

The production activation-reconciliation worker now leases durable
`approval_submitted` and `activation_submitted` attempts, resumes them on
startup and every ten seconds, and applies bounded retry after RPC failures.
Its lease prevents concurrent Render instances from processing one attempt at
the same time. A stale worker cannot complete a newer lease. The worker
reconciles from the immutable admitted attempt rather than the current API-key
state, so later key revocation or project suspension cannot hide an ambiguous
onchain transaction. It has no signing or submission authority and operates
independently of the public activation switch.

The active-escrow lifecycle worker now discovers every active escrow recorded
by the durable activation registry. It reads all escrow fields and the USDC
balance at a block behind the configured confirmation depth, reconciles that
snapshot against the immutable deployment commitment, and queues a stable
signed event only when the verified state changes. It covers step release,
completion, cancellation, refund, and confirmed-block expiry. Expired escrows
remain under observation until their eventual refund or another terminal
state. Per-escrow durable leases, stale-token rejection, bounded retry, startup
recovery, and stable event IDs prevent concurrent or duplicate processing.
Invalid or under-collateralized snapshots produce no lifecycle event.

Per-project pilot capacity is now reserved in the same durable mutation that
issues an activation challenge, before Circle can submit the payer-authorized
transaction. Direct transaction admission passes the same locked check.
`ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT` and
`ARC_AGREEMENT_DAILY_VOLUME_USDC` are required in addition to the existing
per-agreement ceiling. Pending activation submissions reserve capacity
immediately, and recording the resulting transaction atomically converts the
reservation into submitted volume without counting it twice. Verified active
and ambiguous reconciliation states continue to count; a confirmed revert does
not. Completed, cancelled, and refunded
agreements release the active slot, while their successfully admitted amount
remains part of the UTC submission day's volume. Replaying the same durable
transaction consumes no additional capacity. The counters are derived from
project-isolated durable attempts and transactions inside the store lock, so
concurrent challenge reservations or direct admissions cannot oversubscribe or
drift from a separate counter.
Circle failures with no provider transaction identity or Arc hash release the
reservation. Any failure with a provider transaction identity remains reserved
until authoritative transaction recovery and reconciliation, so an ambiguous
provider result cannot silently reopen capacity or issue a replacement
activation challenge.
Code caps the pilot at 100 active agreements and 10,000 test USDC per project
per UTC day.

The operator execution path is now implemented behind its own disabled
`ARC_AGREEMENT_OPERATOR_WORKER_ENABLED` switch. An action is first persisted as
`awaiting_review`; it cannot be claimed until a different operator identity
approves the immutable request hash and records a review note. That hash binds
the developer project, agreement, release step or cancellation, evidence hash
and reference, operator wallet, escrow target, and requester. Only one reviewed
or ambiguous operator action may be open for an agreement at a time.

The worker re-reads the durable active escrow and a confirmed Arc snapshot,
re-verifies the Circle developer-controlled operator wallet, and reconstructs
the exact `releaseStep` or `cancelByOperator` call through the existing policy
boundary. Circle submission uses a durable UUID v4 idempotency key. If the
process exits after Circle accepts the call, the same request can be replayed
without creating another logical transaction. Once a Circle transaction id is
stored, the worker never submits a replacement: it polls and verifies the
wallet, source, target, method, parameters, reference, state, and transaction
hash.

Provider completion is not authoritative. The worker also verifies the Arc
transaction sender, target, zero value, exact calldata, successful receipt,
confirmation depth, immutable agreement reconciliation, and expected release
step or cancelled state. A release is refused once the confirmed block time
reaches agreement expiry. Durable leases, stale-token rejection, bounded
backoff, single-open-action admission, and manual-review states prevent
concurrent Render instances or ambiguous provider outcomes from advancing the
same escrow twice. No public operator route or automatic reviewer exists.

The master switch remains false, so the route can review a private agreement
but cannot prepare or submit an activation in production.

The authenticated payer route now also supports the two contract-native exit
paths without giving Hash PayLink payer signing authority. Cancellation is
offered only while the confirmed escrow is active, no release has occurred,
the cancellation window exists, and the confirmed Arc block time has not
passed it. Expiry refund is offered only after the confirmed block time reaches
the immutable expiry. Both actions are bound to the original Privy payer
identity, linked Circle Arc wallet, durable active escrow, exact zero-value
call, and exact Circle smart-wallet envelope.

Lifecycle challenge creation is independently disabled by
`ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED`. It is intentionally separate from the
new-agreement activation switch so a future activation pause does not define
the policy for exiting existing escrows. Once a Circle challenge or
transaction exists, authenticated recovery and confirmed-chain reconciliation
remain available: disabling new lifecycle challenges cannot make an ambiguous
payer transaction disappear.

The lifecycle journal persists a deterministic request commitment, retry
sequence, Circle idempotency key, challenge and provider state, Arc hash, and
exact execution form. Provider identifiers remain server-only. A failed
challenge with no provider transaction or Arc hash receives a new idempotency
key; an ambiguous provider transaction cannot be replaced. A recorded action
becomes confirmed only after the exact transaction, successful receipt,
confirmation depth, complete immutable escrow reconciliation, and expected
cancelled or refunded state all agree. The payer page uses a deliberate
two-step confirmation and never offers cancellation and refund simultaneously.

The existing Privy-allowlisted Developer Operations surface now includes an
Arc Agreements view. It joins durable activation attempts, confirmed Arc
state, payer cancellation/refund journals, and operator journals without
returning payer identity hashes, Circle challenge or provider transaction
identifiers, wallet ids, or idempotency keys. Chain reads are bounded to four
concurrent confirmed-snapshot requests and fail closed per agreement.

An allowlisted operator can save an evidence-bound release or cancellation
request. A different allowlisted Privy identity must approve the unchanged
request hash and add a review note. Approval only moves the durable journal to
`queued`; it cannot submit a Circle transaction while
`ARC_AGREEMENT_OPERATOR_WORKER_ENABLED=false`. Pending, chain-pending, failed,
manual-review, payer-exit, completed, cancelled, and refunded states are
visible from the same restricted surface. Manual-review states have no blind
retry control.

## Remaining blocker before invite-only activation

Run one invite-only end-to-end activation using a specifically allowlisted
developer project and a low test-USDC ceiling.

Public activation, payer lifecycle submission, and operator execution must
remain off until that gate is closed.

Before any activation window, configure exactly one managed human-checkout
project, `ARC_AGREEMENT_MAX_USDC=1`,
`ARC_AGREEMENT_DAILY_VOLUME_USDC=1`,
`ARC_AGREEMENT_MAX_ACTIVE_PER_PROJECT=1`, and a duration ceiling no greater
than 604800 seconds. Keep the master switch and every worker switch false, then
run:

`npm run preflight:arc-agreement-invite -- --project dev_...`

The preflight resolves the real test project from the durable developer store,
requires an active test key, signed webhook, Arc Testnet recipient, and Arc
Agreements capability, verifies the Circle operator wallet, private Arc RPC,
reviewed factory bytecode, and all strict limits, and prints no API key,
entity secret, wallet id, or webhook secret. Passing it does not activate
anything. A later one-agreement activation window still requires explicit
authorization and must not enable the payer-lifecycle or operator workers.

## Hash PayStream pilot receiver

The standalone Hash PayStream pilot receives confirmed lifecycle events at:

`POST /api/hashpaystream/arc-agreement-webhook`

The route is mounted with a raw JSON body before the global JSON parser so its
HMAC covers the exact bytes Hash PayLink sent. It requires
`x-hashpaylink-event` and `x-hashpaylink-signature`, accepts only a five-minute
timestamp window, and binds the signed payload to
`HASHPAYSTREAM_ARC_PROJECT_ID`, Arc Testnet chain 5042002, a durable agreement
id, and the known agreement lifecycle event set.

`HASHPAYSTREAM_ARC_WEBHOOK_SECRET` contains the one-time `whsec_` value created
for that developer project and is server-only. Accepted events are stored in
the Render durable store without the signature or signing secret. Identical
delivery retries increment a duplicate counter and return success; reusing an
event id with a changed payload is rejected. The receiver records authoritative
events but does not release funds, fulfill content, or trust browser redirects.

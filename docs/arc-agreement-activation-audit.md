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

## Remaining blockers before invite-only activation

1. Build a payer-controlled review and signing flow for USDC approval plus the
   factory `createAndFund` call. The backend must never impersonate the payer.
2. Persist activation attempts and reconcile ambiguous submitted transactions
   before allowing a retry.
3. Add a confirmed-chain reconciliation worker that discovers every active
   escrow and queues lifecycle webhooks without relying on a manual script.
4. Add per-project active-agreement and daily-volume limits in durable storage.
5. Add the operator contract-execution submission worker with evidence review,
   idempotency, transaction-status verification, and confirmed-chain
   reconciliation.
6. Add payer cancellation and expiry-refund interfaces that call the escrow
   from the payer wallet.
7. Add an operations view for pending, stuck, dead-letter, cancelled, refunded,
   and completed agreements.
8. Run one invite-only end-to-end activation using a specifically allowlisted
   developer project and a low test-USDC ceiling.

Public activation must remain off until all eight blockers are closed.

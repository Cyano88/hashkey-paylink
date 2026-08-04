# Arc Agreement agent lifecycle

Agentic Arc Agreements reuse the reviewed Arc Agreement factory, activation
policy, durable attempt journal, confirmed-chain reconciliation, signed
webhooks, lifecycle workers, and authoritative receipts. They do not use the
human payer capability or Circle email-wallet challenge flow.

## Authentication and identity

`POST /api/v2/agreements/agent` requires a test API key belonging to an
agentic developer project with the `arc_agreements` capability. The caller
also supplies a stable opaque `payerReference` in the form
`apr_<32-64 lowercase hex characters>`. Platforms must derive this reference
server-side and must not send raw user IDs, agent credentials, or wallet
secrets.

The durable attempt is bound to the developer project, opaque payer identity,
and Arc payer address. Hash PayLink never signs or broadcasts for the agent.

## Activation sequence

1. `prepare` binds the agreement, payer reference, and payer address under the
   existing activation policy.
2. `prepare-call` with stage `approval` returns the exact Arc Testnet USDC
   approval call.
3. The agent wallet signs and broadcasts that call directly.
4. `record` journals the transaction hash. `status` waits for confirmed-chain
   allowance reconciliation.
5. `prepare-call` with stage `activation` renews the absolute agreement
   timestamps, reserves project capacity, and returns the exact reviewed
   factory call.
6. The agent wallet signs and broadcasts the factory call directly.
7. `record` and `status` verify the transaction, wait for the configured
   confirmation depth, reconcile the escrow address and terms, and emit the
   signed activation webhook.

Calls are idempotently prepared and transaction recording rejects an
unprepared call, a different payer, a different checkout mode, wrapped wallet
execution, native value, altered calldata, reused transaction hashes, and
activation before confirmed approval.

## Delivery and terminal lifecycle

- `review` returns the current delivery awaiting payer review plus authoritative
  cancellation/refund eligibility when the agreement is active.
- `delivery-decision` accepts or disputes only the current payer-reviewed
  delivery. Acceptance queues the existing guarded Hash PayLink operator
  release; it does not let the agent execute the operator key or bypass the
  authoritative next-step check.
- `lifecycle-prepare-call` with `lifecycleAction` set to `cancel` or `refund`
  persists an agent-direct action and returns the exact escrow call.
- The agent wallet signs and broadcasts that call directly.
- `lifecycle-record` rejects missing preparations, wrapped wallet execution,
  altered calldata, native value, a different payer, and reused transaction
  hashes.
- `lifecycle-status` waits for confirmation depth, reconciles authoritative
  escrow state, and queues the existing signed cancelled/refunded webhook.

Refund preparation remains unavailable until the on-chain expiry condition is
met. Cancellation remains unavailable after release starts, after the configured
window closes, or after the agreement becomes terminal.

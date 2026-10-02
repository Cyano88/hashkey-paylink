# Trade payment adapters

This directory holds physical-goods rules shared by Arc USDC and XLayer xStocks.
It does not implement Work delivery semantics.

## Implemented

- Shared accepted-listing validation and delivery/inspection windows.
- Existing stock parser and planner consume those shared rules.
- Stock terms and bindings retain their original serialized shape and hashes.
- Arc parser requires explicit chain 5042, official USDC, six-decimal precision
  and ordinary-token custody; it rejects stock/testnet combinations.
- Arc binding commits the chain, factory, parties, amount and accepted Trade terms.
- Arc production binding fails closed while the Trade release registry is null.
  The deployed service-agreement factory must never fill that registry.
- Read-only Arc transaction planning and simulation for all participant actions, including exact allowances and mutual split proposals.
- Factory/USDC checks and two-signer Safe policy checks (proxy, singleton, owners, threshold and absence of modules). New-funding pause preserves participant recovery.
- Production release remains null; no HTTP route signs or submits these candidate plans.
- Pure binding construction is available for synthetic deployment rehearsal only;
  it does not authorize transactions or establish a verified deployment.

## Pending before enabling Arc

The Arc Trade factory and on-chain two-signer authority must be verified.
The hosted API, Circle participant-wallet/signing adapter, chain reconciliation,
reviewer adapter, receipts and Stream checkout/UI routing must then be connected
and exercised end to end. No new Arc HTTP checkout route is exposed by this increment.

The existing XLayer dispute test is running in a separate session. Its final
commit and evidence must be incorporated before the combined Trade baseline is
considered complete. Local stock reviewer regressions do not replace that test.

## Verification

- Shared/Arc terms and binding tests; focused TypeScript check.
- Production-source differential comparison: byte-identical stock terms and
  bindings for ordinary, smallest-unit and largest accepted input quantities.
- Existing hosted Trade, planner, reviewer and share-custody regression scripts.
- Stream: explicit rail/precision tests, typecheck, disposable PostgreSQL suite.
- Existing ordinary-token Trade candidate: 46 local contract tests on a Hardhat
  chain configured as 5042, with mock USDC. This is not an Arc mainnet fork or
  funded production test.

Production services, feature flags and contract deployments were not changed.


## Arc planner increment - 2026-10-03

The candidate planner validates confirmed escrow identity and terms, checks the
latest mapping/state/proposal, simulates the exact call, then rechecks the block
hash and chain. Only chain 5042 and the fixed USDC token are accepted. It never
prepares operator dispute resolution for a participant. New-funding authority
checks run against both the confirmed and latest Safe state. They pin reviewed
proxy/singleton bytecode, owners and a threshold of two, and reject modules.

The implementation is exercised with synthetic readers, including every encoded
participant method, paused recovery, deployment/role/term mismatches, altered
Safe configuration, stale proposal nonces and reorg/simulation failures. The
shared and existing XLayer planner regressions and focused TypeScript check pass.
This is not a funded Arc canary or a complete hosted checkout/signing integration.

Safe behavior was checked against primary v1.4.1 source:
https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/proxies/SafeProxy.sol
https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol
The release manifest must pin the version actually deployed; these references
do not establish an existing Arc Safe deployment or select its owners.

## Execution recovery increment - 2026-10-03

`arc-execution.ts` verifies the exact reserved call against a canonical Arc
transaction and receipt, with five subsequent blocks before confirmation.
It accepts a direct participant call, the exact single-call Circle wrapper, or
one matching v0.6 EntryPoint operation. Bundles with extra operations and wrappers
with extra calls fail closed. A successful bundle also requires the matching
EntryPoint `UserOperationEvent`, including its operation hash, sender, nonce,
paymaster and success flag. A failed inner operation is recorded as reverted.
Receipts at or before the reservation's chain-head bound are rejected.

Smart-wallet execution requires reviewed proxy and implementation bytecode plus
the ERC-1967 implementation slot; EntryPoint execution additionally pins its
runtime. These are candidate checks, not evidence that the live Circle wallet
uses this layout or propagates inner call failures. Verify its source, delegation,
modules, upgrade behavior and actual transaction envelope before selecting the
production policy. `ARC_TRADE_EXECUTION_POLICY` remains null. No signing or
broadcasting is performed by this module.

`arc-execution-store.ts` provides durable reservation, challenge association,
submission association and chain reconciliation using the existing transactional
store. Concurrent retries retain one provider idempotency key and the original
prepared call. Unknown outcomes block new actions. Terminal requests remain in
history so replay cannot become a new payment. Session tokens are not stored.
The history is bounded without evicting old idempotency records.

This store is an internal helper, not an authentication boundary. The pending
hosted adapter must authenticate the participant, verify their linked Circle
wallet, obtain a fresh planner result and chain head, reserve before requesting
a challenge, and read provider IDs/hashes directly from Circle. A reservation
must never be built from browser-supplied calls. Provider cancellation, expiry
and unknown-outcome recovery still need integration; this increment deliberately
does not release a pending slot based on a timeout or client claim. Execution
confirmation does not replace the planner's confirmed agreement-state reads.

Validation: new execution and journal smoke tests, focused TypeScript checks,
shared Trade and Arc planner regressions, and existing XLayer planner/hosted
regressions. The journal tests use a serialized in-memory adapter; they do not
constitute a real PostgreSQL concurrency test or Circle end-to-end test.

Primary references checked for event semantics, operation hashing and proxy slots:
- https://github.com/eth-infinitism/account-abstraction/blob/v0.6.0/contracts/interfaces/IEntryPoint.sol
- https://github.com/eth-infinitism/account-abstraction/blob/v0.6.0/contracts/interfaces/UserOperation.sol
- https://eips.ethereum.org/EIPS/eip-1967

Next: authenticated hosted endpoints and Circle challenge recovery, then Stream's
two-rail payment selector. The separate XLayer dispute test and verified Arc Trade
deployment are still required before enabling production.

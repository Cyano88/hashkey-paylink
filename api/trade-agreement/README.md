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
- Hosted Arc Trade draft/read and authenticated participant endpoints are wired,
  along with a Circle checkout page. Source release/execution policies remain
  null, so new drafts and challenges are unavailable in the production defaults.
- Pure binding construction is available for synthetic deployment rehearsal only;
  it does not authorize transactions or establish a verified deployment.

## Pending before enabling Arc

The Arc Trade factory and on-chain two-signer authority must be verified.
The hosted API, Circle participant-wallet/signing adapter and chain reconciliation
have synthetic coverage. Stream checkout/UI routing is connected on its isolated
Trade branch at `f9a112e`. The reviewer and receipts increment below adds their
adapters. The verified deployment and all adapters must be exercised end to end before
enabling new Arc Trade checkout.

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

The subsequent hosted increment below supersedes this increment's endpoint TODO.
The separate XLayer dispute test and verified Arc Trade deployment are still
required before enabling production.

## Hosted Circle increment - 2026-10-03

Added `GET/POST /api/v2/trade-agreements` and participant-only
`POST /api/v2/trade-agreements/participant`. Live human projects with the Arc
Agreement capability and USDC settlement can query availability. Draft creation
also requires both reviewed source policies and project/runtime activation.
Developer credentials receive draft/read scopes only; participant routes reject
API keys and verify the Hash PayLink account independently.

Participants accept the exact consent hash using their server-linked Arc wallet.
Fresh Circle session ownership is checked, links are re-read for migration races,
and accepted wallet identities cannot be replaced. Both acceptances create the
immutable binding. Challenge creation uses only a trusted planner call, verifies
wallet execution bytecode/implementation before issuing, and reserves its payload
and idempotency key before calling Circle. Provider timeouts retry that same key.

Recovery obtains challenge and transaction identities from authenticated Circle
reads. A provider transaction ID is pinned before its hash appears; changes or
ambiguous correlations fail closed. Browser transaction hashes are ignored.
Receipt-not-found and insufficient-confirmation outcomes retain the pending
action. New-funding pauses preserve existing challenge recovery and participant
recovery actions. Failed/expired provider challenges without a verifiable chain
outcome remain reserved for review; automatic release of that slot is not enabled.

`/agreements/trade/:agreementId` follows the existing Hash PayLink checkout chrome
and Circle session flow. It includes exact terms, consent, action review, split
proposal amounts/nonces, pending recovery and account-change cancellation. Circle
session tokens remain in component memory. The shell and page use loading
shimmers and support both themes. Payment success is read from the server/chain,
never inferred from the SDK returning successfully.

Validation: hosted authorization/recovery smoke; execution, journal, Arc planner
and existing XLayer planner/hosted regressions; focused backend/frontend TypeScript
checks; Vite build into an isolated temporary output. Local Playwright fixtures
covered mobile dark/light layout, explicit confirmation, pending action controls,
exact split review amounts and no horizontal overflow. Provider calls and wallet
signing were mocked. No real Circle canary, mainnet deployment, PostgreSQL journal
concurrency test or production rollout is claimed.

Circle response shapes were checked against primary documentation:
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-user-challenge
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-transaction

Stream's versioned Arc reservations and two-rail selector are implemented in
`f9a112e`, preserving legacy and existing stock reservations. Its adapter, picker,
HTTP routing, PostgreSQL concurrency and production build checks passed locally.
Reviewer/receipt production validation and funded end-to-end release verification remain.

## Read-only release preflight

Run `node --import tsx scripts/arc-trade-preflight.mjs` to inspect the source
release gate. It currently reports the missing release, execution policy and
participant wallets without making an RPC request. This is not a live deployment
scan and does not prove that no candidate contracts exist on chain.

Once reviewed deployment evidence exists, use `--wallets buyer,seller` for the
source release, or `--candidate manifest.json --wallets buyer,seller` for a
read-only candidate inspection. The candidate JSON contains `release` and
`executionPolicy` with the types defined in `arc.ts` and `arc-execution.ts`.
Use public wallet addresses only; no signing credentials are needed. A candidate
file cannot replace the production source registry. The RPC uses the existing
Arc mainnet configuration; its URL and provider errors are omitted from reports.

The preflight pins factory, USDC, Safe and both wallet checks to the observed head
and five blocks earlier. It rejects stale blocks, changed block hashes, wrong
chain, bytecode, owners, threshold, modules or implementation. It never signs,
broadcasts, writes a registry or enables a feature flag. Exit 0 means these
inspection checks passed, 2 means blocked, and 1 means invalid invocation.
`productionReady` remains false: reviewer/receipt production validation, a real Circle
lifecycle/recovery canary and the separate XLayer split evidence are still needed.

Validation: `node --import tsx scripts/arc-trade-preflight-smoke.mjs`, existing Arc
planner/execution regression scripts, and a focused TypeScript check. Synthetic
tests cover both snapshots, source gating, invalid/missing wallets, altered Safe
and wallet state, stale blocks, reorganizations and sanitized RPC errors.

## Project-scoped review and receipts increment

`POST /api/arc-trade-review?workspace=...` uses the existing `trade-disputes`
email/section/project authorization. The operations workspace offers separate
USDC-on-Arc and xStocks-on-XLayer views. Stock review endpoints and decisions keep
their existing identifiers. Switching networks is disabled during a review action.

Arc decision storage is separate and its Safe typed data binds chain 5042, the
reviewed arbiter, escrow, exact six-decimal buyer allocation, reason hash and Safe
nonce. The adapter verifies the factory and source-pinned Safe bytecode, owners,
threshold and disabled modules at confirmed and latest state. It rechecks nonce,
escrow state and the canonical block before returning. Execution requires two
distinct owner signatures and a successful exact-call simulation. The server
never broadcasts; the reviewer explicitly confirms with their external wallet.
The source release remains null, so production decisions cannot be prepared yet.

Settlement receipts require a canonical successful transaction, five subsequent
blocks, a matching terminal escrow event and the exact official-USDC transfers
to buyer and seller. Pending, reverted, wrong-token, duplicate or mismatched
events are rejected. Receipt storage is immutable and tied to project, agreement
and terms. Confirmed participant journal references retry receipt verification on
read; browser-provided participant hashes are ignored. Reviewer refresh uses its
saved submission hash only as a locator and runs the same on-chain verification.
If that browser reference is lost, an authorized operator can supply the verified
transaction reference to the scoped `read` action. There is no chain-wide event
indexer or automated resubmission in this increment.

Participants, scoped operations and developer reads can see the stored receipt.
The participant and operations UI show exact buyer/seller amounts and provide a
JSON download. Cancelled unfunded agreements do not receive payment receipts.

Validation: Arc reviewer/queue/receipt and participant receipt-retry smoke tests;
existing stock reviewer/queue regressions; focused TypeScript checks (`noImplicitAny`
disabled because of an untyped dependency); production Vite build. Local Playwright
fixtures verified desktop light and mobile dark review/receipt views with no
horizontal overflow. All wallet signatures and transfers in these tests are
synthetic. Real Circle/Safe execution, mainnet deployment and the separate final
XLayer split evidence remain required before production activation.

## Reviewer recovery baseline - 2026-10-03

The separate operations session's `b7a4dd92a` is incorporated as `6861cbd46`,
preserving the Trade network-switch busy guard. It adds gas estimation before
send, explicit refusal handling and deliberate recovery of uncertain submissions.
Arc uses the same submission helper with chain 5042 and its native USDC fee
balance; XLayer retains chain 196 and OKB. An account/session change before send
aborts without creating a pending marker. Generic errors, invalid transaction
hashes and timeouts retain the marker; the client never automatically resends.

Arc recovery revalidates all stored signatures, the decision/nonce, factory,
Safe policy and dispute state. The operator must explicitly check reviewer
wallet activity. A pending owner transaction blocks recovery. A successful
recheck only unlocks another explicit review; it does not submit anything.

The available other-session XLayer refund verification script was rerun read-only
against its recorded transaction on 2026-10-03. It reported a successful fully
confirmed full buyer refund with zero seller allocation. This is not evidence of
a partial split. No final partial-split proof or verified Arc Trade deployment
manifest was located in the inspected branches. Existing service-agreement
deployment records do not satisfy the Arc Trade release gate.

Passing validation: stock and Arc reviewer/submission smoke tests, wrong-chain
and session-change rejection, pending-owner and corrupt-signature recovery
rejection, focused TypeScript and production build. These do not establish a
funded Arc canary. The requested deployment details remain an external input.

## PostgreSQL action journal validation - 2026-10-03

`node --import tsx scripts/arc-trade-postgres-smoke.mjs` now exercises the actual
durable PostgreSQL adapter and Arc execution store with separate Node processes.
It creates a fresh local PostgreSQL cluster on loopback port 55443, overrides the
database connection for child processes, checks the database role/address, and
stops only that cluster on completion. PostgreSQL 17 Windows binaries are used
by default; `HASHPAYSTREAM_TEST_POSTGRES_BIN` can select their directory. Temporary
cluster files are retained locally for diagnosis. No existing database is reused.

Passing checks: four concurrent identical reservations produce one entry and one
provider idempotency key; competing request IDs produce one winner; a restarted
process retains the original key and chain-head bound; conflicting challenge IDs
and transaction references cannot overwrite the winning response; late challenge
responses cannot roll back submitted state. A forced database write failure rolls
back the first-write placeholder as well as the action. Changed terms and reads
under another project are rejected without changing the journal.

This closes the earlier PostgreSQL journal concurrency validation gap. Provider
and chain calls are absent from this test; it does not establish Circle or Arc
mainnet readiness. Production release and execution-policy gates remain closed.

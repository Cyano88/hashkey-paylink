# Arc Circle v0.7 execution review

Scope: receipt-verification integration and native execution paths of Circle
SingleOwnerMSCA, its BaseMSCA, StandardExecutor and ExecutionUtils dependencies,
and the actual EntryPoint execution/result path. This is a narrow integration
review, not a full wallet or protocol security audit.

The explorer reports fully verified sources for
`0x9C6E09bc32d1E012dCaA2623E66d2Cc9860C1AeD` (SingleOwnerMSCA, Solidity 0.8.24)
and `0x0000000071727de22e5e9d8baf0edac6f37da032` (EntryPoint, Solidity 0.8.23).
`verify-arc-circle-source.mjs` compared their published deployed bytecode exactly
with Arc RPC and recorded SHA-256 hashes for all 55 and 18 source files.
This relies on explorer verification plus exact runtime binding; it does not
claim independent compiler reproduction.

## Reviewed behavior

- BaseMSCA native execute/executeBatch use the native validation modifier
  (117-120, 242-259). SingleOwnerMSCA validates native owner signatures for
  EntryPoint calls (203-258) and requires owner/self for direct runtime calls
  (261-333). Ownerless mode delegates validation to plugins.
- StandardExecutor executes each call sequentially (36-54). ExecutionUtils
  bubbles actual low-level call failures (57-63). Execution hooks also propagate
  failures. Returning ERC20 false, an empty batch or a no-code target can still
  succeed at wallet level: domain-specific Trade events/state remain required.
- Hooks run even for EntryPoint callers. The new v0.7 policy requires the pinned
  EntryPoint getter, a nonzero EOA native owner, no installed plugins, no execution
  or pre-validation hooks, and empty validation references for native execute and
  executeBatch. These reads use the same historical block as runtime checks.
- EntryPoint handles account reverts as failed operations (339-358). Paymaster
  postOp failure rolls back the inner account execution and records failure
  (114-148, 702-747). Success is derived from opSucceeded, not the outer receipt.
- UserOperationLib hashes packed operation fields; EntryPoint binds that hash
  to its address and chain (363-367). The signature is intentionally excluded.

## Implementation and validation

The trusted policy explicitly selects v0.7; no transaction-driven version
fallback exists. Legacy v0.6 remains available to existing callers. Exact single
handleOps encoding, intended native calls, five subsequent blocks, runtime and
implementation identity, operation hash/sender/nonce/paymaster/result, and
canonical receipt rechecks remain mandatory.

The real seller activation transaction
`0x4dc6323f73d2f78f77c1cd6f90d2c77c8e6b7ad9aaecd20a9d5570bce894fb4b`
passed the updated shared verifier. Both buyer and seller passed live v0.7
runtime and native configuration checks. Synthetic tests cross-check hashes
against viem and reject changed calls, extra operations, cross-version policy,
failed events, runtime changes, wallet extensions, stale receipts and reorgs.
Preflight passes the read-only call capability into its pinned block reader.
The live candidate preflight passed at confirmed/head blocks 24084087/24084092,
including factory, USDC, 2-of-2 Safe and both wallet configurations. Six focused
execution/store/receipt/preflight/hosted smoke suites passed; targeted TypeScript
checking passed for arc-execution.ts and arc-preflight.ts. This is not a claim
that the complete repository typechecks or that the funded lifecycle has run.

The production release and execution-policy constants remain inactive. A read-only
candidate preflight is not authorization or proof of funded Trade behavior.
Next required evidence is the 0.1 USDC funded lifecycle/recovery canary and the
separate XLayer split result. No transfer or signing occurs in these checks.

## Limits

Owner-authorized upgrades/plugins remain supported wallet capabilities. Historical
block snapshots do not alone exclude temporary same-block configuration changes.
Exact single-operation structure and reviewed Trade destinations bound the
accepted path; do not extend it to arbitrary targets or plugins without review.
No exploitable wallet or EntryPoint defect was established in this narrow review.

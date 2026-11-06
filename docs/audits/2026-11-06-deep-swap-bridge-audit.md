# Swap and bridge follow-up audit, 2026-11-06

## Confirmed live findings

- Pixel review showed BNB USDC -> Arbitrum USDC, principal 1.04, fee 0.03, total 1.07 (rounded), with `Bridge fees are still being verified.` This is an application billing guard, not proof of a Privy authentication/configuration failure.
- Operation `3dd3ff26-5413-48a3-95be-a1f4e007e178` remains `submitting`, without a source hash or provider transaction ID. Relay reports waiting. It blocks shared-wallet fee coverage. No resend, cancellation, invented failure, or journal edit was performed.
- The quote path did not check this known blocker before requesting a new route; the user reached approval before the execution guard rejected it. Added an early, wallet-scoped journal check for Privy source routes. Execution still performs full billing, ownership, balance, fee and expiry checks. Other wallets and Circle-source routes are unaffected.
- Shared coverage now returns a specific previous-bridge-pending error. BNB swap preserves this exact safe message instead of replacing it with a generic retry error. Private diagnostics remain excluded.
- New Base -> BNB operation `b13fc5e5-b681-4e7f-b55c-66c7d8e09263` has successful source receipt and verified destination delivery of 0.973792 USDC. Captured source trace passed exact approved batch, principal and reimbursement checks. At capture, source block `0x3344795` was ahead of Base finalized block `0x3343d42` by 2643 blocks. Its submitted journal state was therefore a source-finality wait, not evidence of lost destination funds. No finality gate was weakened.

## Investigation corrected before release

An initial suspected pending-proof-to-zero-coverage issue was not reachable: the production source reader throws on pending proof and returns only confirmed/failed. Removed the unnecessary proposed branch. Added regression coverage proving pending-reader errors propagate without fee valuation or fabricated zero coverage.

## Verification

- Backend regression runner: 37 suites passed, covering cross-chain route validation, owner binding, fee reimbursement, source/destination evidence, recovery, refunds, native EVM/Solana swaps, Arc, BNB and X Layer swap logic, provider balances and token display. These are fixture/regression checks, not 37 live transactions.
- New coverage regression passed for BNB and X Layer: unknown submission blocked before proof calls, wallet isolation, unsigned/cancelled exclusions, proof-error propagation, exact confirmed fee valuation, and proven failure.
- BNB HTTP boundary regression passed, including safe shared-blocker message and private-diagnostic masking.
- Focused backend TypeScript passed after the coverage changes.
- Actual native Form/Progress browser lifecycle passed 56 directed network pairs, including uncertain BNB/X Layer dismissal without cancel, resend, false success or lost recovery.
- Quote debounce browser check passed: rapid input coalesced to one request (248 ms observed).

## Outstanding

- The historical BNB submission outcome is still unknown. Expiry and absent indexed transactions are not proof that it was never sent. This patch improves detection and explanation; it does not resolve that operation.
- Source finality remains an independent settlement requirement. Destination delivery can already inform the shared visible outcome while journal finalization continues.
- No new payment was initiated during this audit. No all-chain live-completion claim.
- Deployment and additional native swap/selector browser verification are recorded separately once observed.

## Deployment and final live verification

- Backend f4044a02af5b5cbd0a94b9778f8522fd44bee8f1 deployed as dep-dbmmajmi0phs73c9b55g; Render live at 05:32:41 UTC; health recovered to HTTP 200 after restart.
- Pixel amount-screen recheck displays the previous-bridge blocker before confirmation/PIN. First live rejected quote completed server-side in 176 ms. No new payment initiated.
- Base -> BNB b13fc5e5-b681-4e7f-b55c-66c7d8e09263 advanced automatically to completed; ledgerPublishedAt 1793943019176. Old BNB 3dd3ff26-5413-48a3-95be-a1f4e007e178 remains submitting, Relay waiting.
- Additional native browser checks passed: actual swap terminal Activity before success on all five Circle networks, and USDT selector/holdings/reversal/quote identity on those networks.
- Display-read audit: usePocketBscBalances shares its owner-scoped cache and bsc-account endpoint; production bsc-account uses readBscDisplayBalances (OKX first, bounded cache, RPC fallback). Fresh execution balance reads are separate. No direct RPC balance calls found in the inspected client balance hooks.


## Privy cause investigation, read-only

- Inspected authenticated Privy fee sponsorship dashboard without opening API-key controls or modifying settings. Gas sponsorship enabled; BNB Smart Chain and X Layer selected; displayed credits remaining $24.69. Client sponsorship disabled, consistent with the server-authenticated dispatch. Privy swap-provider-fee sponsorship disabled; this app's cross bridge calls Relay directly, so that toggle is not its execution path.
- Server-side GET wallet returned HTTP 200 in 310 ms, exact saved ID/address binding, active Ethereum wallet, owner present, zero wallet policy IDs and zero additional signers. This verifies current read access and wallet configuration, not the original authorization signature.
- BNB RPC read-only chain check and USDC balance check returned HTTP 200 in 53/30 ms. Correct chain and current balance covering original total. These are current checks, not historical balance proof.
- No records existed for shared X Layer, BNB swap or BNB cross-bridge sponsorship halt keys. Current blocker is the unknown earlier submission, not a persisted cost-overrun halt.
- Historical timing logs: prepare 11165 ms, submit 11703 ms. Saved quote lifetime 43930 ms, only 786 ms remaining at submitting reservation. The subsequent wallet lookup adds latency before the provider HTTP request. Original provider response was not logged by that revision, so request_expired remains the leading supported hypothesis, not a confirmed rejection.
- Privy public status history showed no reported incident at the attempt time; recent Nov 3 webhook/action incident had resolved before this Nov 5 attempt. Absence of a public incident does not rule out an individual request failure.
- Official current request-expiry documentation confirms rejection if the received deadline is in the past. Official wallet_sendCalls response schema matches our expected data.transaction_id and data.caip2 shape.
- No credentials, authorization signatures or raw provider errors were printed. Credential values stayed inside the server process. No transaction submitted or replayed, no historical status changed.

## Explicitly authorized bounded manual retry

- User requested clearing the blocker and retrying. After being told that original execution remains unknown and both payments could execute, user explicitly accepted the manual override. Preserve the original operation as submitting; do not invent cancellation or failure.
- Added operator-only journal grants with owner, source wallet, exact source/destination/assets, principal/total caps, and expiry of at most one hour. No public endpoint creates these grants.
- Grant binds to one prepared operation under the existing journal transaction, and is consumed on its submitting reservation. Other callers retain the original execution lock. An expired/cancelled unsigned preparation may be replaced; a consumed grant cannot authorize a different operation.
- The specific original operation is excluded only from this retry's billing evidence prerequisite. Existing invoice comparison, other unresolved operations, ownership, fee ceilings, PIN/signature, expiry, and shared locks remain enforced.
- Original full debit remains reserved in both retry quote affordability and fresh execution balance checks. For this incident, intended test is BNB USDC -> Arbitrum USDC, principal <= 0.20 USDC and total <= 0.30 USDC; original reserve 0.094350214389091603 USDC.
- Verification passed: manual-retry scope/caps/expiry/concurrent winner/consumption/original preservation; existing reservation and coverage suites; shared billing suite; Privy runtime/API; 26 source/assets preflight plus combined-balance boundary; focused backend TypeScript.
- Deployment and activation are separate: code alone grants no exception. No transaction sent by these tests.

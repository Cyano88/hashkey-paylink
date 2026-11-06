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


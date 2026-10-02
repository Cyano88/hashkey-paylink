# Pocket Support diagnostics, phase 2 - 2026-10-02

## Scope
- User-requested fresh single-network USDC balance reads, plus individual X Layer token/USDC/OKB reads. No all-chain or full-stock-catalog polling.
- Solana finalized transaction checks validate mainnet identity, signature, owner, USDC mint and net credit. Internal moves between owned token accounts do not count as a deposit.
- X Layer checks resolve the authenticated user's embedded wallet, validate chain/receipt/canonical block and known token net credit. Direct OKB transfers are supported; internal native transfers require staff review.
- Selected owned bills query the original VTpass request only. Ownership, environment and returned references are checked. No vending, refund or retry operation is called. Provider reversal is explicitly not proof of USDC refund.
- Existing NGN/UGX original-amount and payout evidence flow retained.
- Identical reads coalesce, successful results cache for 20 seconds, and process-wide live work is capped at eight concurrent reads. Existing authenticated history-based hourly limits remain. This does not claim a durable distributed quota reservation.
- Personal facts stay in private authenticated backend results and are not sent to 0G inference. Hash cannot move funds.

## Verification
- Targeted strict TypeScript check: zero diagnostics.
- Phase 2 unit smoke: Solana ownership/mint/net-zero/error; XStocks canonical chain/token/self-transfer; direct OKB; fresh balance routing/cache/error; bill status/reversal/ownership; read pressure/coalescing/owner isolation.
- Prior investigation regressions retain NGN/UGX, WAT/EAT, receipt ownership, provider failure and explicit human handoff coverage.
- Existing Solana read transport and VTpass client adapter tests passed.
- Deployment, live provider and Pixel results will be recorded after execution.

## Limits
Current on-chain balance is not full spendable balance reconciliation: pending reservations and fees can change spendable funds. Only the verified current receiving wallet is searched. X Layer receipt inclusion is not an assurance about subsequent swaps, bridges or bank delivery. Unsupported/internal transfers and provider disagreements remain staff cases. This release is not a production certification of every Pocket rail.

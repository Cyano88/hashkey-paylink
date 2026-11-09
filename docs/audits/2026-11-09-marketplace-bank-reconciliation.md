# Marketplace bank outcome reconciliation

Status: internal implementation, not deployed. Production outcome verifier remains absent.

## Implemented

- Required trusted verifier boundary for chain/provider outcomes, matching accepted quote and execution attempt. Null/undetermined outcomes leave funds reserved.
- Exact settlement, definitive reverted funding, or full-return recovery. Partial return, mismatched amounts/destination, nonfinal provider status and unknown basis cannot finalize the payout.
- Immutable terminal outcomes, canonical evidence/transaction reuse checks and idempotent duplicate proof handling.
- Ledger transition, terminal execution state, sanitized evidence and pending payout event persisted atomically. Generic result commands cannot bypass bank reconciliation.
- Late execution acknowledgements cannot revert the terminal attempt state. A seller payout return restores available funds; it is distinct from a buyer refund.

## Validation

Seven fixture suites passed: bank reconciliation, execution, quotes, bank beneficiaries/preparation, wallet beneficiaries, accounting and instructions. Focused TypeScript diagnostics passed for eleven marketplace files.

Reconciliation tests cover missing verifier, pending outcomes, forbidden generic finalization, binding/amount/finality failures, partial returns, commit rollback, concurrent replay, restart idempotency, conflicting terminal evidence, proof and funding-transaction reuse, full returns, reverted funding, event creation and sensitive payload exclusion. Fixtures use serialized in-memory mutations and synthetic evidence; no production DB, Paycrest, RPC or financial action was exercised.

## Still required

Implement actual canonical chain/provider verification and finality policy, including proof that no payout can execute after releasing a failed reservation. Partial returns/fees need a separately designed accounting treatment. Wire signed webhook delivery/retries; events here remain pending. Custody choice/configuration, seller authority, production provider integration, signing and live canaries remain open. These tests demonstrate transition rules, not successful live settlement.

# Marketplace wallet outcome reconciliation

Status: internal implementation, not deployed. No production RPC verifier is installed.

## Changes

- Trusted verifier boundary for exact finalized Base transfer or reverted receipt, bound to payment/attempt, holding revision, approved call, canonical token, sender, recipient and amount.
- Canonical chain/transaction/log evidence IDs and cross-payout transaction reuse protection. Partial, extra, provisional or unknown outcomes leave reservations untouched.
- Atomic terminal ledger state, attempt state, sanitized evidence and wallet event. Identical replay is idempotent; conflicting final evidence is rejected.
- Wallet webhook events use USDC/USDT currency and recipientAmountUnits; NGN fields remain bank-only. Existing delivery engine handles both queues.

## Validation

Wallet reconciliation fixtures cover both assets, missing/pending verifier outcomes, mismatched binding/amounts, provisional finality, invalid logs, commit rollback, competing reconciliation, restart/idempotency, changed terminal evidence, transaction reuse, reverted-funding recovery and wallet webhook payloads. Disposable fixture signatures and synthetic chain evidence only; no RPC request or transaction signing occurred.

Remaining regression and TypeScript results are recorded below after completion. No UI changed.

## Remaining

Implement and verify the production canonical receipt/finality adapter against the chosen holding model, including the actual submitted call and sender. Wire custody/signing and run authorized live canaries before activation. Receipt-shaped objects and the word finalized from an untrusted source are not proof. Pending or missing transactions cannot release funds.

Verification result: all eleven marketplace fixture suites passed. Focused TypeScript diagnostics passed for fifteen marketplace files. These checks validate local transition and delivery behavior, not live chain settlement.

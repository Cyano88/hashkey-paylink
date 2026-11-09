# Marketplace wallet payout reservation

Status: internal implementation; not deployed or enabled for payments.

## Changes

- Scoped wallet payout instruction accepting only payment/allocation/operation references, amount and business reference. Caller cannot select project, chain, asset, destination or result.
- Atomic exact-amount reservation against released funds with active verified wallet and immutable token/destination binding. USDC/USDT accounting stays separate; Cash balance is rejected.
- Internal Base ERC-20 call preparation rechecks reservation and destination. It supplies canonical token target and exact transfer arguments, not a signed transaction or custody-specific escrow release.
- Idempotent retries, changed-request rejection, revocation gates and unknown-outcome protection. Generic finalization cannot bypass the missing wallet verifier.

## Validation

Wallet fixture tests cover both assets, signed beneficiary setup using disposable fixture keys, unfunded/unreleased rejection, request-field/scope isolation, precision, competing reservations, canonical token/calldata decoding, restart/retry, revoked destinations, unknown outcomes and Cash balance exclusion. No transaction was signed or broadcast; wallet-control signatures are fixture signatures only.

Existing marketplace regression suites and focused TypeScript diagnostics are recorded after verification below. No UI changed; displayed decimal formatting remains the existing checkout behavior, while payout accounting uses integer micro-units.

## Remaining

Actual holding/custody source, fee/gas policy, wallet execution claims, signing and canonical transfer/finality reconciliation remain required. The prepared ERC-20 call must not be sent as an arbitrary transaction or treated as permission to bypass the eventual holding contract/account. Public endpoints, live canaries and deployment remain disabled.

Verification result: all nine marketplace fixture suites passed (wallet payouts plus webhooks, reconciliation, execution, quotes, bank, beneficiaries, accounting and instructions). Focused TypeScript diagnostics passed for thirteen marketplace files. These were local fixtures; no live custody, transfer or payout result is claimed.

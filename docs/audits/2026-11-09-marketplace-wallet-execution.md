# Marketplace wallet execution coordination

Status: internal coordination only; no production preflight adapter, signer or running worker.

## Changes

- Exclusive worker claim, lease replacement only before submission, and stale-token rejection for wallet reservations.
- Shared pure preparation used under the transaction lock to revalidate canonical token, exact amount and active immutable recipient.
- Mandatory approval of exact transfer hash, verified holding revision/sender and fee policy. No additional token deduction is accepted; fee/gas coverage outside the allocation must be established by the trusted adapter.
- Freshness/expiry checks and durable ambiguity marker before external execution. Handoff includes a five-second deadline. Unknown payouts cannot be claimed for another submission.
- Immutable transaction acknowledgement and bank/wallet transaction reuse rejection. No settlement inferred from a hash.

## Validation

The wallet execution fixture covers both assets, claim races, expired-lease replacement, stale tokens, missing preflight, rejected approval/fee changes, invalid sender, expired or stale approval, concurrent submission, restart recovery, revocation during preflight and cross-route transaction reuse. Fixtures use disposable wallet-control signatures; no transaction was signed and no network request was made.

Existing marketplace regression suites and focused TypeScript results are recorded below after completion. No UI changed.

## Remaining

Actual holding selection/configuration, production approval and fee policy, custody wrapping, transaction signing/broadcast, canonical wallet outcome/finality verification and live tests remain required. The transfer approval is a trusted adapter contract, not proof of custody on its own. An expired handoff must go to recovery, not delayed signing or automatic resubmission.

Verification result: all ten marketplace fixture suites passed, including wallet execution and the nine existing regression suites. Focused TypeScript diagnostics passed for fourteen marketplace files. No live custody or payment behavior is claimed.

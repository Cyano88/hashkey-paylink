# X Layer Trade web reliability - 29 September 2026

Scope: Hash PayLink hosted xStocks checkout consumed by Hash PayStream web. No Pocket UI or contract changes.

## Recovery
- Privy sign-only replaces combined signing/broadcast. A signing interruption cannot broadcast.
- Signed bytes, deterministic hash, original plan, operation and note are saved before broadcast.
- Verify recovered signer, chain 196, destination, calldata, zero native value and hash.
- Recovery checks for the original transaction. If absent, it revalidates the plan with the authenticated API and asks to resume the exact signed bytes. It never signs a second transaction.
- Same-checkout browser Web Locks prevent concurrent actions across tabs. Unsupported browsers fail closed.
- Receipt reconciliation still requires three confirmations and exact transaction matching.
- Legacy hashless pending records remain blocked: absence of a hash is not proof of no broadcast. They cannot be silently discarded.
- Fee replacement, consumed-nonce replacement recovery, browser-storage loss and cross-device recovery remain outside this change. These require additional coverage; no claim of universal recovery.

## Verified locally
- Signed transaction tamper and intent validation.
- Actual React checkout: failed signing, persistence before first send, lost send response, reload, another-tab exclusion, identical-byte resume, and confirmed cleanup.
- Buyer/seller action matrix across states 0 through 9 and deadline edges.
- Refund and split-settlement receipt labels, stale reads, note validation, confirmed terminal polling and account/agreement changes.
- API participant isolation, immutable bindings, durable notes, scopes, monotonic confirmed state.
- Hash PayStream isolated PostgreSQL suite: reservations, racing buyers, confirmed release marks Sold, Browse exclusion, preserved records, and concurrent idempotency.
- Focused checkout TypeScript check.

## Live coverage
The prior controlled NVDAx trade completed funding, pickup, buyer receipt and seller release. New sign-only implementation still requires the next controlled live signing/funding test. Seller refund and on-chain dispute/resolution are not yet proven by this run.

## Next controlled test
Fresh listing: no physical item, delivery or fees. Use a small NVDAx quantity with buyer and seller roles explicitly checked. Buyer funds; seller submits a distinct refund reason and confirms refund; verify receipt, exact returned shares, buyer balance, no second payout, and listing remains unavailable until a deliberate resale policy exists. User performs financial confirmations.

# Checkout route switching — 7 November 2026

Stablecoin-selection orders can change between Circle, BNB Chain and X Layer before signing starts. The hosted payment card provides a Change payment network action. Navigation stays inside the signed-in application; the same stablecoin remains selected when supported by the destination network.

## Order and payment safety

- New USDC-settlement selection records carry signed route metadata. Each asset/network choice gets a stable idempotency key and child checkout; returning to a route reuses that child. Parent amount, recipient snapshot, expiry and merchant acceptance remain authoritative.
- Switchable Circle children keep their selected network. The parent selector owns all route changes, preventing a saved child from independently locking to a different Circle network than the parent choice.
- A shared durable parent lock is acquired before Circle signing, after BNB approval and before returning its signing request, and before X Layer authorization. Stale child quotes cannot claim the order after switching. The BNB submit path checks the lock again.
- Concurrent switches compare the current child reference. An in-flight child creation reserves its route; signing and competing routes cannot pass that reservation. Lost responses can resume the same idempotent child. Failed creation clears the reservation; reload exposes the reserved choice for recovery.
- Submitted or potentially signed payments never unlock merely because a quote or provider request timed out. Normal payment reconciliation and authenticated fulfillment remain unchanged.
- Child-to-parent lookup includes previously selected routes so receipt and webhook correlation continues to identify the original order.

## Compatibility

Existing selection records keep their original signed format and fixed-route behavior. They may already have an outstanding provider authorization created before the shared lock existed, so they are not silently migrated. Retesting requires a fresh checkout. NGN settlement retains its provider-bound route restrictions. Switching payment networks does not bridge funds already held in a wallet.

## Validation

Route tests cover Circle/BNB/X Layer in both directions, reused child IDs, stale tabs and quotes, switch-versus-sign races, interrupted preparation, recipient changes, expiry and signed-state tampering. Browser tests cover editable selected routes, stablecoin preservation, a disabled change action while busy, client navigation without a document reload, and no payment submission during selection.

Existing selection, Circle/BNB/X Layer adapters, checkout card, merchant-fee proof, BNB service/operation, X Layer fee, return-flow and Circle idempotency regressions were run. Fee-test fixtures explicitly assert the shared claim and reject stale signing evidence. No funded live transaction was signed or broadcast by these tests.

Deployment evidence will be recorded after final source build, scoped TypeScript checking and live service verification.

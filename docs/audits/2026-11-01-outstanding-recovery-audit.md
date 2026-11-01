# Outstanding cost and recovery audit - 2026-11-01

## Verified and repaired in this change

- Hosted checkout entry used one AbortController for all reads and polled hidden tabs. A serialized visibility-aware scheduler now cancels hidden requests, creates a fresh controller for each request, resumes once, and stops on terminal results or visible errors. Server settlement recovery remains independent.
- BNB history proofs lacked per-hash cooldowns. Retry metadata is persisted with the history state; failed proofs back off from 30 seconds to 15 minutes without discarding pending evidence or blocking new hashes from due slots.
- Paycrest refresh/webhook data could overwrite the customer funding tx_hash with the provider lifecycle txHash. Provider references now have their own field. Canonically verified funding is immutable across concurrent/late updates.
- Recovery can repair the legacy funding reference from the execution intent only after canonical token, recipient, amount, payer and creation-time verification. It cannot mark a mismatch paid.
- Generic recovery silently skipped chkb/chkx checkout IDs. Missing/unverifiable signed records now enter needs_review with CHECKOUT_RECORD_UNVERIFIED. Old missing payout records enter review. No expiry-only closure is used for these rails because an in-flight operation may still exist.

## Live read-only evidence before deployment

37 unresolved executions:
- 12 bank payouts: provider records stored settled. Each stored provider hash had a successful Base receipt but zero Transfer logs to the recorded deposit recipient. All 12 original execution hashes differed and passed canonical funding verification. This supports reference repair, not fabricated payment evidence.
- 22 X Layer and 2 BNB prepared checkouts: raw records exist, are expired and contain no stored payment. Standalone SSH readers rejected them, but live HTTP readers accepted one sample from each rail and returned the expected expired response. The diagnostic environment differs from server startup; signature corruption is not established. Preserve records and investigate rail-specific payment evidence; do not re-sign, delete or assume expiry proves no funds moved.
- 1 legacy pos_settlement record: traced to an expired XPay quote, not a separate supported POS product. No provider order or transaction reference. Ledger contains only prepared/review events. See the XPay retirement audit for guarded closure.

## Acceptance

Passed BNB canonical deposit smoke and durable proof retry tests.
Passed real Chrome visibility scheduler tests: hidden idle, serialized resume, fresh controllers, terminal stop, timeout and cleanup.
Passed Paycrest funding-reference, order-state, reconciliation policy, USDT and recovery-worker tests, including missing signed checkout review.
The two previously failing Home fixtures were repaired: wallet mock omitted wallets; balance test assumed the removed inline network layout, old pull distance and idle retry timers. Existing account isolation, retained balances, wallet revision safety, cold shimmer and actual Home scroll clearance checks now pass (320/390/480px for activity).
Production source build, standard repository TypeScript, and an additional changed-API/dependency TypeScript check passed. The API check exposed bridge dependency errors: fixed precise client return types, bigint accumulation and explicit USDC/USDT guards for the Relay paths. Outbound/conversion/evidence tests and four dedicated Solana external-settlement fixtures passed. The older full inbound matrix passed its initial EVM cases but stopped at the Solana signing emergency-control database guard; that safeguard remains intact and its own fail-closed tests passed. This is not a claim that every backend module has been independently typechecked.
No APK change or funded test payment.

## Remaining work and safe order

1. Durable per-wallet EVM cursor: current scans have a bounded recent window. Implement leased per-owner/chain jobs and atomic persisted observations before advancing a cursor. Test restart, duplicate workers, missed intervals, reorg and high-volume pagination before reducing cadence. Keep current detection active meanwhile.
2. Wallet events: existing Circle subscription is contracts.* for gifts, not general wallet coverage. Add a separate signed durable inbox only after checking actual supported chain/token events and tenant-wallet mapping. Prove duplicate/out-of-order delivery and outage recovery alongside scans before switching discovery.
3. Cost attribution: current counters aggregate RPC attempts, not invoices. Add bounded feature/provider/outcome/cache-hit instrumentation across Circle, OKX, native RPC and recovery. Compare equivalent post-restoration periods; do not treat request count as billed CU.
4. Historical checkout review: resolve original signed-record provenance and rail-specific operations before closing 24 checkout records. The single missing POS record also needs authoritative recovery evidence.
5. Native frontend release: test and publish separately with explicit APK release authorization. Installed Pixel remains unchanged.

Use initial/resume/manual/event refresh for displays; fresh canonical reads for payment approval; durable bounded jobs for submitted payments; verified incoming events plus cursor-based gap recovery. A Refresh button must never be required to complete settlement or discover deposits.

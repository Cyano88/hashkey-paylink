# Hosted checkout recovery - 1 November 2026

## Verified evidence

24 unresolved hosted executions: 22 X Layer and 2 BNB. All are expired, prepared and unpaid in their signed checkout records. All 24 signatures and partner ownership checks pass using the running service signing context. All execution ledger events are prepared; no transaction hash or provider reference is recorded.

19 checkouts have no payment-operation record. Five X Layer checkouts have 18 payment reviews in total, all ready, with no authorization timestamp/block or transaction hash. Neither BNB checkout has a payment operation. No matching Circle action-journal submission exists. Four of the older checkout assets are NVDAx; closing old unused records does not restore stock payments.

The SSH diagnostic process received a different HOSTED_CHECKOUT_SIGNING_SECRET from the server-entry processes while using the same database. This explained the false signature-rejection finding. Only equality was logged; no secret was printed or persisted. Verification using the running service context succeeded. No signing secret or record signature was changed.

## Repair

The reconciliation worker now checks signed identity, owner, token, amount, network, expiry plus a one-minute margin, XPay reviews, BNB operation evidence, action journal and execution ledger before expiring an unused checkout. It requires prepared execution state, no payment/provider/hash, no authorization/submission evidence, and a prepared-only ledger. Submitted, unknown, mismatched, paid and missing-ledger cases stay open. Database read failures fail closed. The update uses expected state and appends the normal ledger event with CHECKOUT_EXPIRED_UNUSED and an evidence version.

Expiry is not used as evidence that a submitted payment failed. Authorizers already validate quote expiry inside the durable submission claim. No transaction, provider request, fulfillment event or receipt is manufactured by this cleanup. Existing expired checkout records and payment reviews remain readable in storage.

## Validation

Passed checkout-expiry evidence tests for X Layer and BNB, including paid/submitted/unknown/mismatch/missing-ledger/active-window rejection. Passed recovery-worker integration including the guarded expiry and existing provider-backed recovery. Changed API/dependency TypeScript passed. This is backend-only; no APK build or installation.

Live deployment and post-recovery counts are recorded after rollout.

## Next cost finding (not changed by this release)

The X Layer notification scanner already has a durable global block cursor and block hash. It queries Transfer logs, but also fetches every block in a range (up to 60 per run) with full transactions to discover native OKB transfers. The server schedules this worker every 30 seconds. This is a verified request multiplier even with a small number of registered wallets; it is not a measured dollar attribution. Previous notes describing all incremental scan cursors as absent were too broad.

Do not simply stop this worker or require a Refresh button: it discovers incoming transfers and fulfills accepted requests. Before replacing native block discovery, verify the indexer's support on chain 196, pagination completeness, delayed indexing, native/internal transfer treatment, restart/reorg recovery and duplicate handling. Canonical receipt checks remain necessary for candidates. Then add feature/provider/outcome instrumentation so usage can be compared with Alchemy compute units.

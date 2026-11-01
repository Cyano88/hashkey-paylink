# XPay retirement of standalone POS surfaces

Only XPay is supported. Legacy pos/ng, ng-pos, pos_settlement and stored ID prefixes remain compatibility identifiers for bank receiving, receipts and settlement recovery, not a separate product. Do not bulk rename persisted identifiers or delete their records.

## Changes

- Archived standalone NigerianPos, PocketMovePosPage and PocketPosManagePage under archive/retired-pos; removed imports from the application. Old setup routes now resolve to XPay.
- Existing public QR links retain their payment URL helper in a small shared module, without importing the old setup screen.
- New shared merchant creation requires an authenticated owner-bound XPay bank setup key. Standalone crypto POS creation is blocked. Historical idempotent responses remain readable.
- Corrected visible POS names in activity, receipts, loading states, support and policy descriptions. The older assistant guides users to XPay instead of creating standalone terminals.
- Hardened the operator resolution script: dry run by default; requires an expired XPay quote, matching owner/merchant/amount, no provider order, no transaction/reference, and a ledger containing only prepared/review events. It preserves the record and appends an audited failed closure with XPAY_QUOTE_EXPIRED_NO_ORDER. It never marks an unpaid quote paid.

## Evidence

The single unresolved legacy execution pex_5ffa686c-137f-4788-9df1-37897e24f729 belongs to an XPay quote created 4 October, expired ten minutes later. Read-only live ledger inspection found prepared, prepared, needs_review only; transaction and provider references are null. Closure must still pass the script at execution time.

Passed: production source build; changed API/dependency TypeScript; public QR compatibility; retired QR isolation; standalone creation rejection, XPay owner setup admission, foreign owner rejection and historical replay; unified XPay server checks; legacy payment execution/adapter checks; unused quote evidence rejection tests; old route redirects; real Chrome stale bank-name response regression.

Full frontend/modules TypeScript passed. The older broad XPay browser fixture currently fails bundling Node crypto/stream dependencies and still models stock payments; this is not reported as a pass or used to enable stocks. No phone APK changed and no payment was submitted.

## Live result

Release 60a2ea739 deployed as dep-dbjqgvrbc2fs73djf7n0, live at 2026-11-01 21:06:09 UTC. The guarded dry run passed and --apply closed the exact execution as failed with XPAY_QUOTE_EXPIRED_NO_ORDER; the expired unpaid quote and audit history remain retained. Live health afterwards returned HTTP 200, database true, unresolved 24, all hosted_checkout. No unresolved legacy pos_settlement remains. Overall operations health remains false because those 24 hosted records still need review.

The older Agent Hash parser suite now expects XPay navigation and passes that routing section, but stops later at its pre-existing assertion that pending bank payments must be hidden. Current code deliberately includes pending history; this unrelated fixture mismatch remains outstanding and is not a full suite pass.

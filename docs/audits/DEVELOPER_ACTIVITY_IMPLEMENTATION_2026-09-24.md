# Developer project activity - implementation and rollout

Date: 2026-09-24. Status: implemented locally; no production deployment, database migration, backfill, key creation or funds movement performed.

## Delivered

The developer portal Activity section now reads a dedicated PostgreSQL lifecycle journal instead of the bounded webhook delivery list. It supports exact payment-reference search, cursor pagination, expandable evidence references, explicit loading/errors/empty states, and JSON export of loaded records. Export metadata states its scope and whether more records remain.

The owner-authenticated GET /api/developer-projects route accepts resource=activity, projectId, environment (live or test), optional recordId, cursor and limit (1-100). Ownership is checked before journal queries. Every query binds project and environment. The current UI and source writers use live only; this does not enable sandbox processing or sandbox keys.

## Storage and consistency

- developer_activity_events has a unique deterministic event key and indexed project/environment/sequence and project/environment/record/sequence lookups.
- Checkout, Agreement draft, confirmed Agreement webhook-event and Polymarket Funding stores append selected lifecycle observations in the same PostgreSQL transaction as their state mutation. Failure on either side rolls back both writes.
- Stable semantic event keys suppress replayed observations, including refreshed timestamps and delivery retries. This is a lifecycle observation journal, not an API access log or double-entry accounting ledger.
- Journal rows have no automatic expiry or deletion path. Operational checkout pruning archives the last available selected snapshot before discarding source records.
- History uses explicit field allowlists. It excludes API keys, signatures, payer access tokens, bank account details, payer emails, freeform descriptions and receipt capability URLs. Transaction/provider references, amounts, receipt IDs and Agreement terms/block references remain available as evidence.
- Provider acceptance, verified payment, bank payout, Agreement chain reconciliation and provider bridge observations retain distinct evidence labels. Circle Gateway acceptance is not described as final settlement. Agreement draft creation is never described as escrow activation.
- Funding observations are captured when the existing status endpoint reconciles the provider. A later unavailable provider response cannot erase an earlier completed observation. This change does not add a background bridge indexer or strengthen the underlying provider reconciliation proof.
- PostgreSQL transactions and unique constraints are the concurrency boundary. The application has no journal update/delete endpoint; this does not make the database cryptographically tamper-proof.

## Coverage and backfill

npm run migrate:developer-activity previews counts using the configured database. npm run migrate:developer-activity -- --apply archives remaining source snapshots. The script prints counts only and uses configured source-store names, including the Arc mainnet boundary helper. Re-running it is idempotent.

A backfill records what is still present; it cannot reconstruct previously pruned transactions or intermediate states. occurredAt is the source timestamp; recordedAt is the journal insertion time. Untouched older records require backfill before they appear in the new view. The UI discloses incomplete older coverage.

## Validation

Passed:

- npm run test:developer-activity: event projection and secret exclusion, project ownership, environment/query bounds, retry deduplication, state pruning, both source-write and journal-write rollback failures, isolated cursor pagination and idempotent backfill.
- Existing hosted Checkout, developer project, Polymarket Funding, Arc Agreement, confirmed Agreement webhook and durable storage TLS smoke checks.
- Focused TypeScript check covering both new journal modules, durable storage and the new Activity component.
- Browser fixture: pagination, JSON download (correct project/environment and two loaded events), missing-reference empty state, explicit failed-history state with retry, and 390px viewport with document width 390px.
- Production Vite build passed before final UI labels; final build result is recorded below.

The atomic tests use a deterministic PostgreSQL transaction model with the real mutation and journal functions bundled against a mock driver. They are not a live PostgreSQL integration test. No production data was used.

The broader modified-API typecheck reports remaining diagnostics in api/paycrest-pos.ts, api/paycrest-reconcile.ts and api/pocket/money-ledger.ts. No diagnostics remain in the modified integration files. Full repository typecheck is not claimed clean.

## Rollout

1. Validate schema creation, concurrent inserts, rollback and pagination against a disposable PostgreSQL database with the intended database role.
2. Review the scoped diff alongside the portal UX changes; preserve unrelated workspace work.
3. Deploy through the normal backend/frontend release path. Source mutation must fail closed if the journal cannot be written.
4. Preview and apply backfill against the intended database; confirm project ownership and counts using non-sensitive checks.
5. Confirm database backups and monitor journal/storage growth. This adds database rows and index work; history reads make no paid provider calls. Exact operating cost depends on volume and the existing database plan.

Outstanding platform work remains sandbox isolation, expanded CLI capabilities and server-side Base/Arc agent enforcement. Agreement activation gates are unchanged.

### Final verification

The final production Vite build passed (1m25s; dependency/chunk warnings only). Focused new-module/component typechecking passed. The broader API check retained nine diagnostics in the Paycrest/Pocket files listed above, with none in the modified integration files. Funding observations are now persisted before secondary execution synchronization; a regression test proves a secondary sync failure cannot discard an observed provider completion.

Mobile screenshot: output/playwright/developer-activity-journal-mobile.png. Browser DOM checks and export inspection passed; the local image viewer stalled, so screenshot capture is not visual sign-off. No staging/live PostgreSQL check or production backfill was run.

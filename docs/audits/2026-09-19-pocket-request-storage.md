# Pocket request storage audit

## Verified findings
- api/pocket/paylink-requests.ts previously interpreted every file read or JSON parse failure as an empty store, allowing a later write to overwrite existing records.
- Direct writeFile replacement could leave truncated JSON after interruption.
- Mutation serialization is process-local, not a multi-process lock.
- Render metadata reports one instance, an attached persistent disk, DATABASE_URL present and TELEGRAM_REQUEST_STORE present. The configured request path is relative. Its resolved location and any symlink into the disk remain unverified. No values or credentials were printed. The environment listing was one page; presence was confirmed only for observed keys.
- Existing Pocket collections use a separate durable repository. This audit does not change it.

## Prepared locally, not deployed
- Extracted a file-store adapter with strict envelope and record-ID validation.
- Only ENOENT represents a new empty store; corrupt JSON, invalid shapes and other read errors fail closed with a sanitized 503.
- Writes use a unique same-directory exclusive temporary file, flush it, and rename it over the destination. Existing files are not deliberately removed. This reduces partial-write risk; it is not a distributed lock or a complete power-loss guarantee.
- Existing store path, public API response data, compatibility alias, identity handling and IDs remain unchanged.
- A missing file still initializes an empty store for compatibility; this cannot distinguish first use from previously lost storage.

## Validation
Synthetic tests passed for twenty concurrent writes, corrupt JSON and malformed store preservation, generic read failures, queue recovery, record field preservation and temporary-file cleanup. Existing cross-endpoint compatibility test and focused TypeScript check passed.

## Release gate
Render SSH inspection failed with Permission denied (publickey). No live file was inspected, copied, deleted or migrated. No deployment or environment change was made in this stage. Before deployment, locate the resolved live file, verify its filesystem mount, back it up on persistent storage, and validate record counts/IDs without exposing customer records. Keep TELEGRAM_REQUEST_STORE. A move to Postgres needs an explicit migration and reconciliation step, not an empty-store fallback.

## Live inspection after SSH registration
SSH access verified on 2026-09-19 using the registered workstation public key. Subsequent inspections pinned Render's documented Oregon Ed25519 host key with strict host-key checking and disabled optional host-key updates.

The running server working directory was identified from /proc process metadata. TELEGRAM_REQUEST_STORE resolves to a missing file (ENOENT) from that directory. Its parent exists and its resolved path is outside the persistent disk mount. A bounded search of expected legacy locations and the persistent disk to three levels found no matching request file. This does not establish that there were never historical requests or that no other backup exists.

The Render API lists seven persistent-disk snapshots. No snapshot was restored; no backup of the absent request file could be made. No live request data was displayed, changed, deleted or initialized, and no code deployment/configuration change occurred in this stage.

Next: check historical action-journal or separately retained backup evidence for these request records, establish a recoverable dataset if available, then perform an explicit durable-storage cutover. Do not equate missing file with confirmed empty history. Keep production deployment paused while recovery scope is unresolved.

## Historical recovery check
Read-only aggregate queries of the configured durable action journal confirmed two create-usdc-paylink actions with two distinct resource IDs. No matching request IDs were found in helper_thread_messages, including the owner-matched check. A recursive in-memory check of the available configured helper-profile/collections KV stores found zero matching saved objects (one of the two requested stores existed). No customer content was printed.

The two journal action records were copied, with source and backup timestamp, into a uniquely named owner-only file under hashpaylink-storage-audit-backups on the existing persistent disk. The backup was flushed and read back for exact verification. This preserves action evidence, not the absent complete request records. Zero full request records recovered.

Added scripts/pocket-request-migration-preflight.mjs (dry-run only) and its passing smoke checks. Missing historical records, malformed records, or mismatched owner/idempotency values block readiness. The preflight does not apply changes, initialize databases, or replace live stores. A passing result is a prerequisite, not proof of a completed migration.

External backup/original-link availability has been requested from the user. Durable cutover and deployment remain unapplied while historical recovery scope is unresolved. Existing request links may encode payment details independently; do not claim funds or on-chain transfers were lost from this file finding.

## Authorized detox clean start
The user explicitly authorized data cleanup because the platform is in detox mode. Scope is the audited PayLink request store only; no wallet balances, transactions, receipts, users, other product stores, or journal evidence are authorized for deletion by this implementation.

Initialized hashpaylink:pocket-paylink-requests:v1 in existing PostgreSQL with requests={}, using INSERT ON CONFLICT DO NOTHING. Verified newly created row and zero request records. No existing durable row overwritten. The two historical actions and their verified backup remain preserved as evidence; their full request records are not claimed recovered.

Prepared production adapter uses the existing mutateDurableJson transaction and row lock for concurrent writes, including initial insertion. Both the legacy and Pocket endpoints share this adapter. Database errors and malformed store data return sanitized 503 responses; production refuses local-file fallback. Development-only file storage retains atomic replacement and fail-closed read behavior. TELEGRAM_REQUEST_STORE is no longer used for production persistence after release; DATABASE_URL remains required. No new database service or RPC provider was introduced.

Synthetic adapter tests passed for shared concurrent mutation, simulated restart reads, rollback, malformed storage, and database failure. File tests and cross-endpoint compatibility passed. Focused TypeScript check passed. Migration preflight is retained for future recovery/import attempts; the explicit authorized clean start supersedes its missing-history blocker for this release only.

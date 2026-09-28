# Render disk migration ? 27 September 2026

Scope: migrate persistent file dependencies without overwriting current database records or deleting the source disk. This is not a completed diskless cutover.

## Verified recovery copy

Archive a52a2e3f-5317-454c-91c4-e2e51c279388 contains all 33 source files (147891 bytes), including the existing storage-audit backup directory and Circle CLI session files. Copied within the service to the existing Postgres database; no file bodies or credentials exported to the workstation or logs. Each stored byte sequence was read back and compared, and the source tree was checked again before commit. Original files were unchanged. This is a verified database recovery copy, not an independent database disaster-recovery backup.

The migration utility rejects symlinks/special files and oversize trees. A source change or round-trip mismatch rolls back the archive. It prints only aggregate counts and an archive ID.

## Active adapter migration

Agent profiles and wallet provisioning previously depended on file writes. Their Postgres adapters now initialize once from the source file under a database row lock. Once initialized, Postgres is authoritative, including an empty document. Database errors cannot fall back to files. Writes compare the original read version inside the transaction and reject stale updates. Source files are retained as recovery material and are not updated after migration; do not roll back to the old file-backed runtime without exporting and reconciling current database state first.

Run `node --import tsx scripts/migrate-agent-durable-stores.mjs` only after this runtime is deployed. It migrates the two missing stores and prints aggregate counts. Do not import the older Circle action or event snapshots over their current database values.

Live classification of provisioning records: 2 mainnet-tagged wallets, 3 testnet-tagged wallets, and 1 pending testnet connection. This is mixed historical/live state, not disposable test data. Both environments remain preserved. These labels come from stored chain/testnet fields, not a fresh onchain wallet audit.

## Remaining diskless cutover requirements

Circle CLI is enabled and has 6 session directories. Its HOME-based session/payment files are still used by `runCircle` and payment-debug reconciliation. They require a tested durable session adapter, serialized execution, crash/uncertain-payment recovery and session restore tests before the disk can be detached. A raw backup is not a runtime session adapter.

Event registry still writes a local mirror before Postgres. Helper usage still has a file fallback. Helper profiles use a separate relational table when Postgres is configured; absence from the legacy KV key is not proof they are missing from the authoritative table. Audit these paths before modifying them or importing legacy profiles. Circle action journal is already database-authoritative in production and has newer records than the disk copy.

No disk deletion, domain rerouting, extra paid service or claim of zero-downtime deployment is part of this stage. Preserve the original service/disk until all active file dependencies and database recovery are tested.

## Tests

Archive synthetic tests: byte preservation, corruption rollback, source-change rollback, unchanged originals. Isolated real PostgreSQL tests: concurrent initialization, stale-write rejection, deleted-record non-resurrection and no corrupt-file fallback after initialization. Targeted TypeScript checks pass.

## Live execution evidence

Release bcf3bca882d34345df8416370fca11f0340d889a went live as dep-das774ivcj2c73ak1ta0. The migration command then initialized 3 agent profiles, 5 agent wallets and 1 pending connection. A separate database read verified both complete documents match their corresponding source files using deep equality. The recovery archive remains present with 33 files / 147891 bytes. The provider /api/health returned HTTP 200 afterward. No payment/signing operation or wallet reconnection was invoked. A subsequent concurrently queued provider release b94d707285936e78dcf673ef0a437a0172aa15ac retains this migration by ancestry.

## Stage 2: durable Circle CLI runtime

The Circle CLI adapter now uses a Postgres snapshot per normalized session key, with an advisory lock preventing overlapping operations on that session. Every call receives a fresh private temporary HOME and explicit CIRCLE_CLI_HOME. Files are restored from Postgres, then saved back before a successful response; the source disk is used only for first migration and remains untouched. Payment diagnostics are read from the database snapshot rather than the old disk path.

An intent marker is committed before the CLI process runs. An interrupted operation or failed financial call leaves the session blocked for new financial calls until reconciliation. Read-only inspection and login may still run without clearing that marker. This is conservative: some errors may require operator review even if no payment ultimately occurred. Do not clear the marker just because a request timed out; reconcile provider/onchain evidence first. Existing route-level payment idempotency remains required; this session guard is not a replacement for it.

The adapter rejects symlinks, special files, traversal paths, malformed base64 and oversized snapshots. It refuses hosts with a shared OS keychain until a separately reviewed keychain adapter exists. The live Render host was checked: no CIRCLE_CLI_HOME override and no Linux secret-tool. No secret values were printed. Local Circle CLI source confirms session storage and payment diagnostics use the configured CLI home.

`migrate-circle-cli-sessions.mjs` migrates existing session directories and restores every snapshot into a new temporary directory to compare its contents. `verify-circle-cli-durable-access.mjs` only lists existing mainnet agent wallets and compares ownership in memory, printing aggregate counts. It never sends funds or requests OTPs.

Helper usage now uses the same database-authoritative migration adapter as agent profiles. Event registry no longer loads or writes the old disk mirror when Postgres is configured, and database errors fail closed. Pocket activity is already database-authoritative in production. Helper profiles use their relational tables; their legacy disk profiles are retained in the recovery archive, not re-imported over current account data.

Validation: isolated real Postgres tests cover a fresh-process restart with the source path unavailable, session update preservation, independent temporary directories, concurrent operation rejection, retained payment evidence, unknown-payment/crash replay prevention, database-loss fail-closed behavior, new login, and path rejection. Targeted TypeScript and receipt capability/POS purchase tests pass. The broad pre-existing circle-pocket-contracts-smoke suite stops at line 282 because it expects Polygon wallet linking to be rejected while the current validator accepts it; those validator files were not modified in this migration. The ArchiveRecord type was aligned with the existing NGN/UGX fiatCurrency field already passed by the current event registry.

The disk is still attached during this deployment. A diskless service cutover, backup recovery rehearsal and routing/rollback plan remain separate from deploying these adapters. Do not delete the disk or claim zero-downtime deployments merely because the code no longer uses it after migration.


Stage 2 live migration: release fc9e09ddd8997d0aae637e1ce389106f2fe62890 reached live as dep-das7h60u01pc73eq16g0. All 6 sessions / 26 files migrated and restored successfully, with zero recovery-required markers. Health returned 200. Subsequent release f6b06c4bdc80dc92f88dff7054a9ec0aad412d5f retains the change (ancestry verified).

The first live wallet-list checks were blocked before ownership verification by the installed Circle CLI version policy. The release pinned CLI 1.1.0; npm currently publishes 1.1.4. A separate isolated 1.1.4 installation was used to verify both existing tuple-parameter and raw-callData patches still apply exactly and idempotently. Pinning the new version changes only the CLI package lock entry; the shared node_modules used by the other worktree was not modified. Version-policy enforcement is preserved, not bypassed. Package source: https://www.npmjs.com/package/@circle-fin/cli . Live wallet access must be checked again after the version update; snapshot verification alone is not authentication proof.


## Supported CLI release and final read-only checks

Release e077de5b7e1a1a1c4e438f0421a24c08f93accdc deployed live as dep-das7slbtqb8s739hvfag with CLI 1.1.4. The version block is gone. The verification script checked two existing mainnet agent-wallet records: both require reauthentication, zero version-policy failures and zero other failures. A private aggregate inspection confirmed both ORIGINAL source mainnet slots were already expired and each migrated mainnet slot is deeply identical to its original; no authentication value was printed. This is an existing sign-in expiry, not evidence of lost session files.

A final restore rehearsal passed for all 6 sessions and their current 28 files (the earlier 26-file migration preceded read-only CLI cache updates). There are zero recovery-required markers. The API health endpoint returned HTTP 200. No financial operation was run.

One fresh Circle agent-wallet login is required before claiming live wallet ownership/access is verified after migration. The user has been asked which email to use; do not invent an account or send OTPs to an unconfirmed identity. The physical disk remains attached. A diskless cutover still needs a concrete infrastructure/routing rollback plan and should not be described as completed.

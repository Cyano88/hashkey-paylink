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

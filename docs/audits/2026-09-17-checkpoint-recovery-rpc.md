# Bounded checkpoint recovery scans

## Problem and change

The embedded Hash PayStream recovery fallback previously asked for factory logs from block zero to latest and converted an upstream failure into an empty result. Returning readers could receive a misleading 404 and proceed toward another escrow.

Historical discovery now requires CHECKPOINT_FACTORY_DEPLOYMENT_BLOCK_MAINNET, taken from a verified deployment receipt for the configured mainnet factory. Do not guess this value. Missing/invalid configuration returns recovery unavailable without making a history request. No factory or deployment block was activated in this stage.

Reads go through the existing server EVM read budget with SDK retries disabled. Each attempt searches at most four explicit ranges, scoped to factory, sender and recipient: 120 blocks per range on the fixed public Arc endpoint; 10 on a configured private endpoint. Matching content candidates are verified before their existing unlock identifier is saved. Verification is bounded to eight candidates per range; an unusually dense range remains unavailable rather than silently discarding sessions.

Per process: four concurrent searches, 30 starts/minute, 10-second abort deadline, identical-request deduplication, five-second continuation backoff, 60-second upstream failure cooldown and 30-second completed-negative cache. The existing shared RPC attempt/concurrency limits also apply. These are application request limits, not a claim about Alchemy compute units.

A successful range advances a bounded in-memory cursor backward; retries resume where the search stopped. Failed ranges never advance. The 256-entry cursor cache can restart after eviction, process restart or routing to another instance; it does not remove historical records. Large histories can require repeated manual attempts. There is no automatic browser/background polling. A later reviewed deployment should consider an indexed recovery path if this fallback is too slow.

The API returns a sanitized 503 with Retry-After while a search is incomplete or unavailable. The reader UI stops before new escrow creation on non-404 errors. Saved unlocks and direct-vault content/refund routes continue to use their existing verification paths. No records, receipt identifiers, signing keys, or provider credentials were removed or changed.

## Verification

- New deterministic regression suite: old-session continuation, exact contiguous ranges, failure retry without skipped ranges, concurrency deduplication/caps, per-minute limit, cancellation, negative cache expiry, deployment-block validation and integration guards passed.
- Existing public runtime configuration, EVM read gateway and Arc mainnet boundary smoke checks passed.
- New scanner TypeScript check passed. Broader content-module compilation has seven diagnostics, verified identical to the committed baseline after normalizing line numbers; it is not a clean project typecheck.
- No authenticated or funded on-chain recovery was exercised. Mainnet factory creation remains disabled.

Saved-vault verification now also distinguishes an RPC failure from an invalid/refunded vault: provider errors return sanitized 503 rather than 404, so the frontend cannot interpret a provider outage as permission to create another escrow. Existing content and refund validation rules are preserved.

Isolated production Vite build passed (2m 56s).

# Pocket gift event discovery and RPC reduction — 2026-10-03

Scope: existing Base USDC single/multi gifts and X Layer stock gifts. No wallet signing, custody, balance ownership or fee changes.

Circle contract-event notifications are verified against the raw body with Circle's ECDSA key. Only the two pinned Base gift contracts can queue known gifts. Durable, transaction-hash deduplication schedules reconciliation; notification content never settles a gift. Circle transaction IDs provide a backup discovery path. Provisioning is explicit and repeatable through scripts/provision-pocket-gift-events.mjs --apply after the receiver is deployed.

OKX X Layer logs identify candidate transaction hashes. Indexed emptiness, truncation and errors never establish absence or advance the evidence cursor. Candidate receipts must succeed, belong to the confirmed canonical chain, and contain the pinned contract's exact gift event. Incomplete evidence falls back to bounded RPC scans (100 blocks on X Layer). Provider reads have a bounded 15-second cache and short timeout.

Verified proofs can be reused only after their previous observed block is rechecked for canonicality. Complete evidence for the current on-chain claim count skips historical scans. Identical simultaneous observations share work without caching stale settlement results. Existing worker backoff and terminal completion remain; webhook hints wake reconciliation.

Verification: provider hint/tamper/confirmation/fallback tests, gift backend and reconciliation tests, and changed-file TypeScript checks. Live credentials accepted an OKX log lookup; Circle initially had no subscriptions or monitors. Release and monitor activation pending.

Further cost work to measure before changing: shared immutable-contract verification keyed by canonical block hash; batching supported RPC reads; provider notification coverage for non-gift payments; adaptive balance refresh by visibility/activity. Do not remove pre-sign spendability checks, canonical receipt checks or reconciliation fallback to save calls. No production savings percentage claimed without traffic measurements.

# Pocket gift event discovery and RPC reduction — 2026-10-03

Scope: existing Base USDC single/multi gifts and X Layer stock gifts. No wallet signing, custody, balance ownership or fee changes.

Circle contract-event notifications are verified against the raw body with Circle's ECDSA key. Only the two pinned Base gift contracts can queue known gifts. Durable, transaction-hash deduplication schedules reconciliation; notification content never settles a gift. Circle transaction IDs provide a backup discovery path. Provisioning is explicit and repeatable through scripts/provision-pocket-gift-events.mjs --apply after the receiver is deployed.

OKX X Layer logs identify candidate transaction hashes. Indexed emptiness, truncation and errors never establish absence or advance the evidence cursor. Candidate receipts must succeed, belong to the confirmed canonical chain, and contain the pinned contract's exact gift event. Incomplete evidence falls back to bounded RPC scans (100 blocks on X Layer). Provider reads have a bounded 15-second cache and short timeout.

Verified proofs can be reused only after their previous observed block is rechecked for canonicality. Complete evidence for the current on-chain claim count skips historical scans. Identical simultaneous observations share work without caching stale settlement results. Existing worker backoff and terminal completion remain; webhook hints wake reconciliation.

Verification: provider hint/tamper/confirmation/fallback tests, gift backend and reconciliation tests, and changed-file TypeScript checks. Live credentials accepted an OKX log lookup; Circle initially had no subscriptions or monitors. Release and monitor activation pending.

Further cost work to measure before changing: shared immutable-contract verification keyed by canonical block hash; batching supported RPC reads; provider notification coverage for non-gift payments; adaptive balance refresh by visibility/activity. Do not remove pre-sign spendability checks, canonical receipt checks or reconciliation fallback to save calls. No production savings percentage claimed without traffic measurements.

## Live activation and verification

Source commit 279985af9 is live on Render deployment dep-db0i09rm8hqs73d487dg. Receiver HEAD returns 200; unsigned POST returns 401. Circle subscription is enabled (Circle normalized its notification filter to contracts.*; the handler still accepts only contracts.eventLog for the two pinned Base gift contracts). Six monitors were created and report enabled: funded, claimed and refunded for both Base contracts.

Read-only production verification of an existing funded Base gift reused canonical saved proof with zero log scans and zero receipt rereads. The X Layer draft verified unfunded with zero log scans. A second read-only Base check with saved proof removed found no stored Circle transaction ID on that historical record and correctly fell back to a bounded RPC scan; it did not fabricate receipt evidence. No production record was modified by these verification scripts and no funds moved. New live webhook delivery for an actual funding/claim event remains to be exercised with the user's next gift.

Balance audit follow-up: XStocks display already requests OKX, caches results and pauses hidden/offline refreshes. The OKX display reader has a server-wide 60-second outage circuit that falls back to RPC; measure outage fan-out and full catalogue scans before tuning it. Gift confirmation polling already backs off from 2.5 to 15 seconds and avoids overlap; the worker uses 30-second active and five-minute quiet intervals. These are existing controls, not new savings from this release.

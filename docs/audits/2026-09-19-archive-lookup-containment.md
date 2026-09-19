# Legacy archive lookup containment - 2026-09-19

## Findings

- `/api/agent-verify` uses strictLimiter, but its `/agent` JSON alias did not.
- The legacy paid `/api/agent-ask` handler independently repeated the same deployment-to-head archive query.
- Current Pocket uses `/api/pocket/agent/ask`. Hash PayStream source search found no direct calls to these legacy endpoints. Standalone PolyDesk contains its own verifier and requires a separate change.
- A public event ID and payer name are replayable labels, not authenticated payment entitlement. The old Access Mode docs incorrectly taught callers to unlock content from a matching archive event.

## Changes

- Applied the existing strict limiter to the `/agent` alias.
- Shared archive lookup between the legacy API and paid assistant. Deduplicates identical event/payer requests, caches matches for 30 seconds and misses for 5 seconds, limits retained entries to 256 and concurrent distinct reads to 4 per process. Failed reads are not cached.
- Clones returned values to prevent cross-request mutation. Event IDs remain case-sensitive; payer matching remains case-insensitive.
- Destroys the RPC provider after each read, including timeout/error paths. Sanitizes provider errors before either consumer can log them.
- Preserved receipt fields and legacy verified=true semantics. Added verificationScope=archive_event_only, settlementVerified=false and payloadVerified=false to the lookup response.
- Removed unsafe access-control examples and retired Agent Hash/Telegram promotion from the relevant docs; documented historical root limitations.

## Validation

- Offline cache tests: concurrency/deduplication, positive and negative expiry, cache eviction, mutation isolation, retry after failure and invalid input.
- Local mock-RPC integration: API and shared helper use one log query, preserve receipt fields, declare proof scope, redact provider failures and retry successfully.
- Focused TypeScript check passed for the lookup, cache and handler.
- Host routing smoke passed all 14 cases.
- Full production Vite build passed in 5m28s to .codex-temp/detox-20260919-build, preserving tracked dist. Dependency annotation, eval and large-chunk warnings remain; this is not a clean whole-repository typecheck or security audit.

## Limits / next steps

This is per-process request containment, not an archive index. A cache miss still requests historical logs. A durable transaction index/cursor and explicit legacy paid-agent retirement need separate dependency and migration review. No authorization redesign is claimed for the still-present legacy paid assistant. No funded transaction, data deletion, provider-key rotation or repair of old roots occurred.

Production release and browser checks must be recorded separately. Mainnet funded-flow verification and remaining credential retirement remain open.

## Browser verification

The locally built docs were intercepted at docs.hashpaylink.com in an isolated browser session. The 0G root-history section and revised access guide rendered, with screenshots saved under output/playwright. Production APIs were not used. Mobile screenshot reviewed at 390px. This is a local build check, not production verification.

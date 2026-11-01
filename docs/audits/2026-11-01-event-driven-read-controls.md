# Event-driven read controls - 2026-11-01

## Implemented

- Display balances (Circle networks, BNB and X Layer) and retained home FX estimates load on entry, resume or explicit refresh/events instead of idle provider polling. Payment quotes retain their existing freshness checks.
- Activity completion uses at most five observation reads. Observation reads cannot initiate provider scans. Ready-empty accounts stop refreshing; saved history remains visible on failures.
- Activity sources reuse healthy results for 60 seconds and back off failed automatic reads from 15 seconds to 5 minutes. Manual refresh retains the existing five-second owner gate.
- The push worker persists a rotating owner cursor instead of repeatedly taking the first 50 owners. Incoming detection and settlement recovery remain enabled.
- BNB account display requests share their runtime price cache.

## Validation

Passed full repository TypeScript check; subsequent FX-only TypeScript check also passed.
Passed event-driven-reads, pocket-money-push-worker, pocket-durable-activity and pocket-bsc-payment-service smoke scripts.
Passed new headless Chrome activity and display-event tests: bounded observation, ready-empty state, two simulated idle minutes without provider reads, event refresh and saved balances retained after failure.
Two older Home UI fixtures failed at layout/gesture selectors. They were restored unchanged; focused hook tests are not full visual acceptance.
Production source build passed (2m17s). Initial sandbox directory denial was resolved by rerunning with approved access.

## Live evidence and boundaries

A read-only configured Base RPC request returned HTTP 200 and the correct chain ID after Alchemy restoration. Other chains were not independently declared restored by that probe.
The pre-release health response still reported 37 unresolved historical executions. No historical payment was marked paid or deleted as part of this work.
No APK was installed, rebuilt or uploaded. Native bundled frontend changes require a separate tested release.

## Remaining cost work

- Durable incremental scan cursors before reducing incoming-payment scan frequency.
- Verify general wallet webhook coverage; the existing Circle contracts subscription only handles the gift flow.
- Hidden-tab checkout polling, reconciling existing uncommitted checkout changes first.
- Per-transaction recovery backoff and provider/feature/cache/outcome telemetry.
- Compare production request counts and billed compute units after rollout. Request counts alone do not establish invoice savings.


# Provider usage and wallet event coverage - 2026-11-02

## Scope

Adds bounded process-local usage reports to shared EVM/Solana reads, BSC reads and history, Circle wallet requests, balance display reads, X Layer discovery and its billing audit. Existing legacy counters remain. No scan cadence, provider subscriptions, payment validation, retry policy, or installed APK changes.

Reports distinguish physical HTTP attempts (`requests`) from logical batch operations (`count`), cache hits and shared work. Validated read helpers report success/error; transparent fetch adapters report `http-ok` only, which does not establish JSON-RPC or business success. Durations cover the wrapped operation (headers only for transparent fetch). Counts are not Alchemy compute units or invoice savings. Other unwrapped SDK/direct requests are outside coverage.

Labels are closed allowlists: feature, network, operation, provider, outcome. Reports contain no URLs, paths, wallet addresses, request arguments, keys, or exception text. Maximum 256 rows per window; dropped logical counts appear as overflow. First report after 60 seconds, subsequent reports every 300 seconds, including traffic followed by idle time. Timers are unreferenced and perform no network I/O. Aggregate separately across process instances using report timestamps.

## Verified baseline and event coverage

The live legacy window ending 2026-11-01 22:54:35 UTC (300581 ms) recorded 30 Solana signature queries; 30 EVM log queries each for Base, Arbitrum, Ethereum and Polygon, and 28 for Arc. These are activity counts, not monetary estimates.

Read-only inspection of the live Circle notification subscriptions returned one enabled contracts.* subscription to the existing Pocket gifts event endpoint. Source handles signed contracts.eventLog notifications for Base gift contracts and wakes canonical gift reconciliation. This is not proof of general wallet deposit coverage. No subscription was changed.

General EVM wallet activity still uses bounded overlapping history scans rather than durable per-wallet cursors. Solana uses signatures and verified finalized transaction caching. Keep these scans until actual chain/token event coverage, a durable event inbox, canonical validation and missed-event recovery are implemented and verified. This does not claim Circle lacks additional capabilities.

## Validation

Provider usage smoke checks cover closed labels and privacy, provider hostname spoof rejection, concurrent feature context, bounded cardinality, logger failures, preserved return/error identity, batch/request accounting, transparent response bodies and abort signals, and an EVM rate-limit -> public fallback -> cache hit fixture.

Existing EVM reads, Solana budget, activity efficiency, BSC runtime, RPC cost controls, native balance API and X Layer discovery smoke checks pass. Targeted backend TypeScript check passes. Live deployment evidence will be appended after verification.

## Live proof

Commit bf0637c56b5a7dcb89af6523d8f331ae3e691562 deployed as dep-dbjsbqgae00c73f5dscg, live at 2026-11-01 23:11:41.568 UTC. Source build passed. A brief transition 502 recovered; health reported ok, healthy database, unresolved=0 and stale=0.

First report: 23:11:35.728-23:12:35.729 UTC, 60001 ms, overflow=0. Actual attribution includes six successful Alchemy eth_getLogs calls on each of Base, Arbitrum, Ethereum and Polygon; six Solana signature requests and one HTTP batch containing twenty logical operations; zero-request cache hits; two OKX X Layer discovery pages; and X Layer billing-audit Alchemy traffic of thirty receipt reads, thirty block reads and one chain ID read. This startup window is not a steady-state cost estimate. Billing-audit repetition is a concrete next investigation target, with canonical payment verification preserved.

Arc activity emitted a public-RPC network error and an aborted sibling request in this window. This is a separate remaining provider reliability observation, not a successful scan or evidence of a telemetry regression. X Layer discovery stayed indexed and lag fell 67 -> 36 -> 6 -> 0, remaining zero on the next scan. No new payment outcome or invoice savings are claimed.

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

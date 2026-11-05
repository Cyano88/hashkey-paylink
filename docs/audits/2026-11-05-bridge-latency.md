# Bridge latency audit - 2026-11-05

Inspected shared/direct bridge quote timing, native recovery, server worker, and canonical EVM/Solana finality readers across the eight networks. Identified and removed these avoidable waits:

- Cross-chain quote debounce was 700 ms while direct bridges used the shared 200 ms value. Cross-chain now uses the same constant.
- Bridge polling became as slow as 30 seconds after two minutes. Successful pending bridge reads now use 4 seconds initially and an 8-second cap afterward, for both direct and cross-chain recovery. Approval waits, failure backoff and explicit Retry-After remain intact.
- Native operation recovery and server cross-chain recovery were sequential. Both now run at most three independent operations concurrently. Server drain single-flight, rotating 50-operation batches, per-operation identity locks and source/destination settlement checks remain unchanged. A native 429 stops further queued work and preserves the longest concurrent Retry-After.

Passed: native/backend targeted TypeScript; all-eight-chain schedule boundaries and throttle checks; native blocked-read recovery with seven other operations completing and no duplicate calls; server blocked-chain isolation, concurrency cap, single-flight, fairness beyond 50 records; bridge API identity/cancellation/recovery; native cross-bridge review/signing lifecycle fixture. No assistant initiated live transfers.

Live read-only probes of configured RPC endpoints on the production server returned in 102-241 ms. Snapshot latest-minus-finalized timestamp gaps: Base 1624 s, Arbitrum 939 s, Ethereum 816 s, Polygon 5 s, Arc 0 s, BNB 1 s, X Layer 1329 s. Solana confirmed-minus-finalized slot gap was 0. These are one-time checkpoint measurements, not an SLA or measured end-to-end transaction duration. Latest EVM heads were current within about 11 seconds. Long finalized-checkpoint gaps remain required by the current proof policy; no finality requirement was weakened. The background server timer remains at its existing configured cadence.

Backend dbc80ad912e4244fbdf4e2bff32e9a45260df07d; Render deployment dep-dbm59a9srm7s73f4bea0. Native source snapshot native-release/bridge-latency-source-20261105.zip in the Pocket Android workspace.
Rollout verified: Render deployment live at 10:09:54 UTC; API health HTTP 200. Installed pocket-bridge-latency-20261105.apk on Pixel 5A160DLCH006VM without clearing data. SHA256 4EE629ADA35535FFAE7207976CD86A60BD7B5DCE4799348FB7AD697E5DA30323; all 1868 packaged web assets matched dist. Pocket was backgrounded after installation; no unrelated app was captured or operated. Live transfer timing after this release has not been measured.

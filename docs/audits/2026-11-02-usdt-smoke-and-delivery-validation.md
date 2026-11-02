# USDT smoke repair and remaining live-delivery validation - 2026-11-02

The prior 503 was a fixture gap: the USDT signing test mocked RPC/prices but not durable emergency-pause storage. The guard correctly failed closed without configured storage. The test now bundles an isolated storage fixture, following the existing emergency-pause signing harness. Production code and production pause state are unchanged.

Running, paused and storage-offline cases pass. Paused/offline cases explicitly assert zero partial signatures. The running case retains USDT mint, recipient, fee, decimals, quote replay, low-balance and cross-asset activity assertions. Its old expected 500 for body mode=withdraw was stale; the existing endpoint intentionally returns 403 and directs callers to the authenticated Pocket flow. The revised assertion checks that exact rejection. Emergency-pause authorization/revision/distinct-person-resume tests also pass.

Live delivery: a read-only query of pocket:wallet-event:v1 records returned zero entries. This does not demonstrate a delivery failure: no eligible real transfer was observed. Enabled subscriptions, signed synthetic tests and historical transaction verification cannot substitute for real signed delivery.

## Proposed live evidence matrix - no funds authorized or moved

| Network | Supported activity assets requiring real inbound/outbound evidence |
| --- | --- |
| Base | USDC, USDT |
| Arbitrum | USDC, USDT |
| Ethereum | USDC, USDT |
| Polygon | USDC, USDT |
| Arc | USDC |
| Solana | USDC, USDT associated token accounts |

Use normal account activity where possible. A controlled campaign would cover eleven chain/token combinations and both directions, using only explicitly identified, authorized accounts. Proposed principal is 0.01 token per transfer; final amounts, sender/recipient ownership, balances and network fees must be verified before any funded test is approved. No wallet is selected by inference, and native/internal transfers are outside this stablecoin matrix.

For each case: record the actual Circle-signed inbound/outbound event arriving at the endpoint; confirm durable inbox persistence and duplicate handling; confirm authenticated Circle ownership/state binding and canonical finalized proof; confirm exactly the expected supported activity rows and eventual completion. Retain fallback scans until coverage is demonstrated. Do not use self-generated signatures, manufactured event rows or provider status alone as delivery evidence.

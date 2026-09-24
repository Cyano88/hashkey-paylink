# Render environment cleanup � 2026-09-24

Live inventory: 168 settings before cleanup; 162 afterwards. Names only recorded. Exact remaining values compared in memory and unchanged.

## Removed from Hash PayLink Render

| Setting | Evidence |
| --- | --- |
| ARB_RECOVERY_KEY | Only consumer was the deleted one-off contracts/scripts/recover-arb.ts, for USDT0 sent to an old Base router address on Arbitrum. |
| KEEPER_PRIVATE_KEY | Stale V1 sweep configuration; referenced handlers no longer exist. Removed from render.yaml and .env.example. |
| ANTHROPIC_API_KEY | No consumer in reviewed deployed source or current working application source. |
| AGENTIC_STREAMING_CRON_SECRET | No consumer in reviewed deployed source or current working application source. |
| POLY_STREAM_CACHE_MS | Unused configuration name; no reader. |
| ZEROSCOUT_HELPER_REFINEMENT_LANE | Unused configuration name; no reader. |

Render DELETE readback succeeded at 05:40 UTC. Provider keys were not revoked, wallets were not emptied, and no transactions were signed. Removing a private key from this service does not invalidate it on-chain. Other services and local secret files were not changed. Runtime activation must be verified after deployment.

## Retained

CRON_SECRET is used by current security and bills/refund endpoints. FACTORY_FROM_BLOCK remains used by historical payments and stream indexing. Pocket migration/bridge/payment recovery and checkpoint history remain. Current Circle, Privy, OKX, Alchemy, VTPass, Paycrest, database, encryption, PIN and signing settings remain. Smile is paused, not retired; its configured integration is retained pending a separate decision. Operator wallet provisioning references and unused ETH relayer candidate require separate ownership/recovery review; not deleted merely for lacking a runtime reader. PolyDesk service authentication and Polygon RPC remain.

Validation: existing Pocket migration recovery and checkpoint recovery regression suites pass. Template changes remove obsolete keeper cron instructions while preserving current endpoint authentication. No whole-platform readiness or full credential revocation claim.

## Deployment verification

Commit c17c0156a23aae1482b7a6cd0cc8670e162828cb is live as dep-daqbg9p42hec73931pk0. Runtime SSH confirms all six removed environment names are absent, the deleted script is absent, and PIN pepper/CRON_SECRET remain configured. Public health, retired assistant rejection, Pocket authentication rejection, and historical proof input validation all pass at 05:47 UTC. Transient 502 responses during rolling deployment recovered; no zero-downtime claim.

# Creator and PolyStream retirement — 2026-09-24

Retired old creator publishing, discovery, admin approval, social mutations and new x402 purchases. Historical stored unlocks still restore through the existing handler; no new payAgentX402Service call remains there. Creator routes show retirement information; existing gate links expose recovery. Recovery no longer starts PoA accrual/signatures, creates checkpoint vaults, activates new payment balances or automatically releases checkpoints. Existing refund and receipt implementations remain unchanged.

PolyStream and World Cup news endpoints return 410 with no provider calls. Historical article IDs remain stable. Old Arena creation/start actions return 410; existing cancel/settle actions retain their original authorization checks. Standalone Bullsprint, standalone PolyDesk, current Arc Agreements and Pocket payment rails are unchanged.

Removed from Hash PayLink Render: CREATOR_ADMIN_KEY, POLY_STREAM_API_KEY, POLY_STREAM_FIXTURE_MODE, POLY_STREAM_LEAGUE_ID, POLY_STREAM_LIMIT, POLY_STREAM_PROVIDER, POLYMARKET_MATCH_URLS, ARENA_ESCROW_FACTORY_ADDRESS, ARC_POA_CONTRACT. Compared all unrelated settings in memory: unchanged, including RELAYER_PRIVATE_KEY. No values saved in this report.

Retained CREATOR_OFFICIAL_WALLET for historical attribution and ARENA_RELAYER_PRIVATE_KEY pending historical signer/fund reconciliation. Mainnet contract/recovery configuration remains where historical readers or settlement use it. No databases, stored records, wallet keys or balances were deleted.

Passed: creator-retirement-smoke; checkpoint-recovery-scan-smoke; archive-handler-smoke; changed TS/TSX parsing. The creator test verifies 410 without fetch and compares historical receipt/recovery/refund function bodies and article-ID generation against the prior release. Local changes were synced to main using git apply --check before applying. Live build and endpoint checks follow deployment.

Live verification: deployment dep-daqddec9v7es73cp7pl0 (2194f7629) is live. Health 200; both sports feeds, creator publish/discovery/admin/new-payment, and Arena creation 410. Checkpoint recovery validation remains 400 for missing arguments. All nine probes passed.

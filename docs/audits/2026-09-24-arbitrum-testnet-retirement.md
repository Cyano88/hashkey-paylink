# Arbitrum relay and old Arc/Arena testnet cleanup — 2026-09-24

User confirmed Arbitrum uses Circle gas sponsorship and authorized deleting old Arc/Arena testnet data.

- Removed the separate permit/Multicall3 Arbitrum relay. Endpoint now returns 410 without RPC, signing or broadcast. Removed its checkout gas estimates, reimbursement rows, external-wallet CTAs and relay receipt/pending state. Circle payment execution remains.
- Deleted 16 legacy Arena rows after verifying all 14 unique escrow addresses had contract code on Arc testnet chain 5042002. Deleted exact legacy stores hashpaylink:arc-agreement-verified-recipients:v1 and hashpaylink:arc-agreement-webhook-audit:v1. Transactional checks confirmed mainnet Arc store values unchanged. No Arc/Arena files existed under the service DATA_PATH. On-chain testnet history cannot be erased and was not altered.
- Removed RELAYER_PRIVATE_KEY_ARC and ARENA_RELAYER_PRIVATE_KEY from this Render service. Removed RELAYER_PRIVATE_KEY_ARB only after verifying it exactly matched retained RELAYER_PRIVATE_KEY. All unrelated settings unchanged. Standalone Bullsprint/PolyDesk unchanged.
- Passed Circle EVM Gas Station and Pocket checkout-routing checks, retired endpoint tests and changed TS/TSX parsing. No payments or on-chain mutations performed.

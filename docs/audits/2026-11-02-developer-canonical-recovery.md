# Duplicate canonical receiving-wallet recovery - 2026-11-02

Production read-only diagnosis of the reported builder account found 11 owned Circle
wallets: two canonical five-chain EVM batches created 12 seconds apart, plus Solana.
Saved Base, Arbitrum and Arc links all reference the same second batch; Ethereum
and Polygon links are absent. Both target networks have two LIVE v4 SCA originals.
The previous exactly-one-original rule therefore returns 409 for both networks.

Recovery now accepts the unique original in the authenticated, server-linked Base
batch when all originals are valid canonical v4 wallets backed by corresponding
Base batches. Matching requires address and creation batch, not newest ordering.
The verified Base record must itself be present in inventory. Duplicate matching
records, absent or untrusted anchors, mismatched batches, invalid wallet states,
replacement candidates and truncated inventories retain the fail-closed behavior.
Existing links remain authoritative; compare-and-set prevents concurrent overwrite.
No historical wallets are deleted or migrated and no funds are transferred.

Regression: developer-wallet-recovery-smoke passes both the original scenarios and
the incident-shaped two-batch cases for Ethereum and Polygon, including reversed
inventory, older active anchor, invalid matches, repeat setup, preserved history
and provider GET-only calls. Focused helper TypeScript check also run.
Production deployment and read-only live-helper validation recorded separately.

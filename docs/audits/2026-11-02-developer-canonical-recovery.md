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

## Release verification

Commit 1e9771edd36df8c442c0b0cb986b401af6cf99cf deployed as
Render dep-dbk362vf3r2c738ig6o0, live 2026-11-02T06:56:58.299039Z.
Post-release health: healthy, database available, zero unresolved/stale actions.
Deployed helper was run read-only against the affected owner's 11 live Circle
records, with provider ownership and complete-page checks. Both Ethereum and
Polygon selected the exact existing wallet in the linked Base batch; both passed
gas-station wallet validation. No provider writes, link changes or transfers.
The builder must retry Enable Pocket wallets in his own authenticated session;
successful client completion is not yet observed.

Separate native-link work remains at d40954212 on fix/native-links-20261102 in
hashpaylink-checkout-release-20261102. It is locally tested but not deployed or
installed. The actual developer checkout link is still needed to reproduce the
reported white screen; this backend release does not include native-link changes.

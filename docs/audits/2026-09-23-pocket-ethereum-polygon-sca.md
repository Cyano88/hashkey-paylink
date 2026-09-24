# Pocket Ethereum and Polygon SCA rail audit — 2026-09-23

Status: audit and first implementation step only. The two networks remain Coming soon in Pocket. No wallets were created and no transaction was submitted.

Verified Circle documentation:
- https://developers.circle.com/wallets/supported-blockchains — user-controlled SCA support on Ethereum (ETH) and Polygon PoS (MATIC).
- https://developers.circle.com/wallets/gas-station — both networks support Gas Station; account policy eligibility still needs verification.
- https://developers.circle.com/wallets/account-types — first outbound SCA transaction incurs deployment costs; Ethereum costs require an explicit bounded sponsorship policy.
- https://developers.circle.com/stablecoins/usdc-contract-addresses — Ethereum native USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48; Polygon native USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 (not USDC.e).
- https://developers.circle.com/wallets/unified-wallet-addressing-evm — adding user-controlled networks uses the user wallet API; do not substitute developer-controlled wallet APIs or assume existing migrated SCA addresses will match.

Implemented foundation:
- Shared Gas Station guard now recognizes exact ETH and MATIC mainnet SCA records.
- Unknown network identifiers fail closed rather than falling through to ARC.
- Regression coverage rejects testnets, cross-network wallet records, wrong ID/address, EOA and frozen wallets.
- Transaction routes, creation and UI remain gated by their existing allowlists.

Remaining integration work:
1. Add explicit Ethereum/Polygon chain metadata, native USDC and network-verified read RPC configuration.
2. Extend user-controlled Circle wallet creation/opening and ownership linking without changing funded Base/Arbitrum canonical wallet selection or migration records.
3. Extend Pocket network schemas, cached balances, transfer receipt verification, notifications and activity with chain-specific ownership and native token checks.
4. Extend receive, send, requests and supported merchant checkout network handling. Keep bank payout and CCTP/bridge routes on their existing validated networks until separately implemented.
5. Enable UI only after sponsorship policy and real provider readiness are verified. Preserve shared quiet-refresh cache and PIN/fingerprint approvals.

Render configuration inventory (names/presence only, all pages checked): POLYMARKET_RPC_URL exists; dedicated PRIVATE_RPC_URL_ETH, PRIVATE_RPC_URL_ETHEREUM and PRIVATE_RPC_URL_POLYGON do not. No CIRCLE gas/policy env key found; this does not establish whether Circle Console has active sponsorship policies. Existing Polygon RPC usage belongs to older integration paths and must be verified before reuse.

POS fixes alongside this audit:
- View payments uses React Router internal navigation with the same terminal query.
- Download QR saves high-resolution PNG with white quiet zone and exact checkout link; Android uses ACTION_CREATE_DOCUMENT without storage permissions.
- Browser checks confirm no new tab/document reload and successfully decode the exported QR.

KYC follow-up:
- Enrollment start/resume already paused, but the hosted identity-frame route still served Smile capture.
- Replaced that route with a no-store Coming soon page, denied camera permissions and provider connections, retained the known-origin close protocol for older app sessions. Existing result/callback records remain intact.

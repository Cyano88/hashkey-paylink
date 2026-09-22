# Pocket XStocks execution audit — 2026-09-22

Privy embedded wallets sign on X Layer (196), behind Pocket review and PIN/biometric approval. Transaction modals are hidden; required Privy authentication/recovery prompts may still appear. Circle Stablecoins rails remain separate.

## Live provider verification
The Hash PayLink Render service has OKX_API_KEY, OKX_SECRET_KEY and OKX_PASSPHRASE. These names are supported as a complete credential bundle; OKX_DEX_* takes precedence as a separate complete bundle, without mixing secrets between bundles.

Authenticated read-only OKX calls returned an executable USDC to NVDAx route for a synthetic wallet. No user funds were moved. The audit found two compatibility defects: env naming mismatch and missing DAG ABI support. The current ABI was derived from official MIT source contracts/8/DexRouter.sol and interfaces/IDexRouter.sol at https://github.com/okxlabs/Web3-DEX-Router-EVM-V1 . dagSwapTo selector is 0x0c307f76.

The live route includes OKX's documented positive-slippage-only fee trailer. The validator allows only its exact two-word encoding, requires the fee threshold to equal the displayed expected output, caps the rate at 10%, binds fee metadata into the sealed quote, and preserves the on-chain minimum. Unknown trailers, partner commissions and dual-charge formats remain rejected. The Pocket review discloses this fee. Official source: contracts/8/libraries/CommissionLib.sol; policy: https://web3.okx.com/onchainos/dev-docs/trade/api-fee .

## Transaction controls
API authentication and embedded-wallet ownership; 45-second user-bound sealed quotes; client/server calldata decoding; router/spender allowlists; input/output/receiver/minimum/deadline validation; exact-amount approvals; quote refresh after approvals; rejection of worsened minimum, changed fee policy or increased gas; preflight call and gas checks; account-switch/unmount checks; persisted pending/uncertain state to prevent repeat submissions.

## Quiet balance refresh
The mobile client shares account-and-wallet scoped in-memory snapshots and in-flight requests across screens. Ordinary refresh retains known values for at most 60 seconds. Checks run about every 45 seconds when visible/online, back off on failure, and refresh after confirmed transactions or explicit refresh. A full 808-contract baseline is reconciled every five minutes. Intermediate reads inspect incoming/outgoing Transfer logs and query only affected stock balances, plus native USDC and OKB. Block hashes detect reorganizations and trigger a full reconciliation; lagging node heads fail closed. Token decimals are cached. No persistent financial data is added to memory files. Browser public price quotes are shared, deduplicated, refreshed quietly and expire after 60 seconds.

## Evidence and limits
Targeted TypeScript checks; adversarial calldata, fee trailer, quote isolation and precision tests; send validation; mocked balance cache dedup/expiry/backoff/owner isolation and 808-to-1 delta tests; read-only native USDC and complete catalogue balance scan; fixture browser asset selection, holdings and shimmers. Live route fixture passed the updated validator. Real signed buy/sell/send and account-authenticated end-to-end mobile execution have not been performed. Latest persisted transaction plus explorer is available; no full indexed activity feed is claimed. RPC savings depend on provider billing; fewer contract executions are verified, not a guaranteed credit reduction percentage.

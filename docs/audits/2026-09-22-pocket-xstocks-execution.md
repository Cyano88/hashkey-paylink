# Pocket XStocks execution — 2026-09-22

Privy embedded Ethereum wallet owns funds and signs on X Layer (196). Pocket provides review plus existing PIN/biometric confirmation; transaction UI is hidden with showWalletUIs:false. Circle Stablecoins rails are separate.

OKX v6 swap and approve-transaction endpoints run server-side at POST /api/pocket/xstocks/swap. Privy authentication and embedded-wallet ownership are required. Quotes are user-bound HMAC sealed and expire after 45 seconds. Client and server decode router calldata and validate assets, amounts, receiver, minimum, deadline, router and spender. Unknown methods/trailers fail closed. Exact-amount approvals precede swaps. Fresh quotes cannot worsen the reviewed minimum. Unknown submission outcomes block duplicate signing.

Required Render configuration: OKX_DEX_API_KEY, OKX_DEX_SECRET_KEY, OKX_DEX_PASSPHRASE. Existing PRIVY_APP_SECRET signs quote envelopes with domain separation; optional POCKET_SWAP_QUOTE_SECRET overrides it. Never put OKX secrets in VITE variables. Credentials were absent during implementation, so authenticated live OKX quotes and end-to-end trading remain unverified. No funds were moved.

Official ABI source (MIT): https://github.com/okxlabs/Web3-DEX-Router-EVM-V1/tree/main/DexRouterabi . Restricted to four supported methods. Router/spender verified against https://web3.okx.com/onchainos/dev-docs/trade/dex-smart-contract ; rotations require review. Native USDC verified against Circle contract documentation and on-chain decimals/symbol. Do not substitute bridged USDC.

Validation: adversarial calldata/quote/precision tests; mocked OKX auth envelope; read-only native USDC verification and all 808 stock balance calls; mobile browser review/deposit/invalid-send flows. The browser signer was a fixture. No live signing validation. Activity exposes latest persisted submission and explorer history; it is not a complete indexed activity feed. Required Privy recovery/auth prompts may still appear.

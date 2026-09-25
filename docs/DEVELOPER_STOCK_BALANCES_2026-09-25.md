# Developer stock balances

POST /api/v2/wallets/stocks/balances uses an active live developer key with wallet:stocks:read. Body: { wallet: EVM_ADDRESS }. This is a read-only query of public X Layer holdings. It does not establish wallet ownership or grant signing; builders authenticate their own users and select verified wallets before forwarding requests.

Reuses Pocket readServerStockBalances and readStockMarketPrices, with project-qualified caching. Response includes chainId 196, wallet, holdings with exact units/balance, observedAt, complete, stale, pricingComplete and estimatedValueUsd. Cash and gas are excluded from stocks value. Incomplete or stale holdings or missing prices produce a null total, never a false zero. Values are market estimates, not guaranteed proceeds.

CLI: request wallet:stocks:read and keys:manage; issue a separate stock read key. hosting plan --product stock-balances targets HASHPAYSTREAM_STOCK_BALANCE_API_KEY on Render. Existing wallet/funding keys gain no new permissions.

Hash PayStream authenticates its user and verifies its existing embedded stock wallet server-side before calling this endpoint. It uses only the scoped backend key; the client no longer performs its own stock RPC scan.

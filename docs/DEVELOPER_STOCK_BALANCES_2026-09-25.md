# Developer stock balances

POST /api/v2/wallets/stocks/balances uses an active live developer key with wallet:stocks:read. Body: { wallet: EVM_ADDRESS }. This is a read-only query of public X Layer holdings. It does not establish wallet ownership or grant signing; builders authenticate their own users and select verified wallets before forwarding requests.

Reuses Pocket readServerStockBalances and readStockMarketPrices, with project-qualified caching. Response includes chainId 196, wallet, holdings with exact units/balance, observedAt, complete, stale, pricingComplete and estimatedValueUsd. Cash and gas are excluded from stocks value. Incomplete or stale holdings or missing prices produce a null total, never a false zero. Values are market estimates, not guaranteed proceeds.

CLI: request wallet:stocks:read and keys:manage; issue a separate stock read key. hosting plan --product stock-balances targets HASHPAYSTREAM_STOCK_BALANCE_API_KEY on Render. Existing wallet/funding keys gain no new permissions.

Hash PayStream authenticates its user and verifies its existing embedded stock wallet server-side before calling this endpoint. It uses only the scoped backend key; the client no longer performs its own stock RPC scan.


## Connected Hash PayLink wallets
For a user who approved a Hash PayLink wallet connection, the builder backend may send `{ userId, walletAppId }` instead of `{ wallet }` to the existing balances and receive endpoints. Take both values from the server-side redeemed connection; never accept either field from the builder's browser, infer it from an email, or substitute the builder app's embedded wallet. The service checks its configured Privy authority and requires exactly one embedded Ethereum wallet on that account. Supplying both an address and a connected identity is rejected.

This follows the builder-asserted connected identity boundary used by hosted Swap: the project key is trusted to supply the redeemed account ID. It is not an independent proof that a caller has persisted a connection. Responses echo the resolved userId and walletAppId so the builder backend can bind the result to its saved connection before returning public balances/receiving details to its frontend. No signing authority is granted.

`POST /api/v2/wallets/stocks/open` uses the same `wallet:stocks:read` scope and connected identity body. It creates or returns a project-, authority-, user- and address-bound view link at `/wallet/stocks/wst_...`. This is a hosted wallet view, not a payment order or transfer. The participant must sign in to the exact account; a different account or a changed wallet is rejected. The view reuses Pocket's stock transfer form, payment-security gate, preparation, user approval, submission and recovery. A project API key cannot submit a transfer. The participant endpoint accepts only `read`, never send/execute.

Legacy `{ wallet }` reads remain supported and remain public chain reads. Builders should label an earlier wallet explicitly rather than silently falling back to it when their connected account is unavailable. Existing funds are not transferred or consolidated by these APIs.

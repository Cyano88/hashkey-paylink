# Wallet receiving data for custom builder UI

These are additive read-only fields. Existing project scopes remain unchanged. API keys stay on the builder server.

## X Layer
POST /api/v2/wallets/stocks/balances with the existing wallet:stocks:read key and {wallet}. The builder must verify that wallet belongs to its authenticated user.

The response now includes gas: {symbol: OKB, decimals: 18, units: exact integer string, balance: exact decimal string, observedAt, stale} and receive metadata. This reuses Pocket's block-pinned snapshot; OKB is not included in estimated stock value. Never display stale/missing gas as zero.

## Arc
POST /api/v2/wallets/arc with the existing wallet:arc key and {path: /receive, method: GET, userToken: the active Circle user token}. data.wallets contains walletId and receive metadata for verified live ARC smart wallets owned by that Circle session. Missing user tokens are rejected; testnet wallets are filtered out.

## Shared receive metadata
address, chainId, network, networkName, qrValue, qrFormat (evm-address), assetKind (usdc or xstocks), gasSymbol, depositNotice, gasNotice, pocketIdRouting.

QR generation happens locally in the app. qrValue is the same checksum address returned in address. Show the network notice next to it. USDC receiving is Arc-only; stock receiving is X Layer-only. X Layer users also need native OKB for fees. Builders may change component layout and typography without recreating network/asset instructions.

## Identity boundary
pocketIdRouting is not_provided. This API does not resolve Pocket IDs or attest cross-app ID ownership. Hash PayStream currently has its own Arc-oriented ID directory. Do not claim Pocket/X Layer ID interoperability until a verified shared directory is connected. Wallet-address deposits work independently of an ID directory.

## Validation
Stock API regression covers exact OKB decimals/units and receive address/chain consistency. Arc regression covers session authentication and filtering out sandbox wallets. Existing transfer scope and project-isolation checks remain intact.

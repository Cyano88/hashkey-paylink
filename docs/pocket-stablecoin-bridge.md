# Pocket stablecoin bridge

USDC retains the existing Circle CCTP route across Base, Arbitrum, Ethereum, Polygon, Arc and Solana.

USDT uses a separate LI.FI/Across V4 adapter. Initial source/destination choices are Base, Arbitrum, Ethereum and Polygon. Availability depends on a valid live route and amount; no route means no approval. Arc and Solana USDT execution are not implemented.

Token contracts come from `pocketUsdtAssets.ts`. Arbitrum's configured token is identified as USDT0 by the provider. The adapter checks contract addresses and chain IDs, not symbols. A read-only Arbitrum-to-Base quote was verified against the exact configured token contracts. No live transfer was executed during implementation.

## Execution

- Both wallets must belong to the authenticated Pocket user.
- Quotes bind owner, wallets, assets, source amount, exact calldata, delivery minimum and expiry with a server signature using the existing `POCKET_SWAP_QUOTE_SECRET` and a separate domain.
- Only Across V4 bridge calls and the bounded LI.FI fee-forwarding step are accepted. Token swaps, arbitrary source operations, native value and destination calls are rejected.
- Exact approval, bridge and approval revocation run in one Circle SCA batch. The source wallet must support Circle gas sponsorship. The exact batch is simulated before a challenge is created.
- Pending requests are persisted before wallet authorization. Server records prevent duplicates and survive reloads.
- A source receipt must confirm the expected bridge ID and exact source debit. Completion also requires a linked provider delivery and a confirmed net receipt of the correct destination token above the approved minimum.
- Partial delivery/refund/provider failures require review and never silently become success or trigger a resend.

The USDT journal action is `wallet.usdt-bridge`; it is deliberately isolated from USDC CCTP polling. Pending USDT transfers are recovered in the bridge screen and recorded with the USDT symbol in Activity. Background recovery without opening the bridge screen is not implemented for USDT.

## Validation

Run `node --import tsx scripts/pocket-usdt-bridge-smoke.mjs`, plus the existing bridge adapter and activity smoke scripts. A funded end-to-end transfer still requires an explicitly approved amount and route.

References: https://developers.circle.com/cctp ; https://docs.li.fi/li.fi-api/li.fi-api/requesting-a-quote ; https://github.com/lifinance/contracts/blob/main/src/Facets/AcrossFacetV4.sol ; https://github.com/lifinance/contracts/blob/main/src/Periphery/FeeForwarder.sol

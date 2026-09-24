# Payment fee rollout - 2026-09-24

## Current implementation

- Shared platform fee: 25 basis points (0.25%), calculated with integer USDC units.
- Circle EVM payments use signed 120-second quotes bound to wallet, chain, recipient, amount and fee mode. Base, Arbitrum, Arc, Ethereum and Polygon execution are covered.
- RPC balance checks reject a quoted EVM payment before opening a Circle challenge when funds cannot cover amount plus fees.
- Solana payment builder now quotes getFeeForMessage plus required token-account rent, converted with a fresh SOL/USDC price. Current signed-wallet payments preserve the full recipient amount and transfer platform plus network recovery to SOLANA_TREASURY. Legacy inactive vault sweep remains separate.
- Solana quotes preserve case-sensitive base58 addresses. Missing, expired or changed quotes cannot produce a payment transaction. Increased costs require a refreshed quote.
- External-address Send uses Review fees, then the existing PIN/fingerprint confirmation. Pocket-ID payments and bank settlement retain their existing fee treatment.
- Direct Solana sends retain signed bytes before broadcast; retries reuse the signature. A different payment is blocked while an earlier submission is unresolved.
- Bank liquidity discovery considers Base, Arbitrum, Arc, Solana, Ethereum and Polygon. It retains existing Base funds and covers the shortfall from one other source with sufficient funds for the bridge quote. It does not aggregate several source networks.
- Additional wallet setup, balance readers, native USDC mappings, bridge ownership proofs and request journals cover the six-network set. RPC identity caches include both network and endpoint.

## Verification

- Read-only checks from Render: Ethereum and Polygon public RPC chain IDs match. No private ETH/POL RPC was configured at check time; public fallback worked.
- Read-only Circle CCTP forwarding quotes into Base returned HTTP 200 for Arbitrum, Arc, Solana, Ethereum and Polygon.
- Render public ETH, POL and USDC price requests returned fresh data. No authenticated Circle transaction estimate or real payment was executed.
- Mocked tests cover five EVM fee conversions/execution, recipient/treasury amounts, insufficient funds before challenge, tampering, expiry, wrong-chain ownership and retry keys.
- Mocked Solana tests cover RPC fees/rent, exact recipient amount, treasury amount, insufficient funds and broadcast-timeout recovery without duplicate payments.
- Wallet bootstrap, bank payout recovery, bridge proofs, bridge recovery, request persistence and existing EVM/Solana transfer adapter tests pass.
- Web and native web bundles compiled during integration. Rebuild after the final merge before packaging.
- Full repository typecheck is not passing: it reports existing errors and a repeated run stalled. Do not report a clean typecheck.

## Release status

- Work is local until a deployment and APK install are explicitly recorded below.
- Pixel 5A160DLCH006VM is connected. Update com.hashpaylink.pocket in place with adb install -r; do not uninstall or clear data.
- The earlier APK at HEAD 9483161b1 is outdated for these changes.
- Live changed from aaab0a11a to c0175e7d7 during this work. Merge the verified Arc deployment metadata before publishing; do not enable Agreement execution as part of this release.
- API quote requirements need matching web/mobile clients. Older APKs cannot use these new mandatory quoted-payment paths.

## Remaining platform-wide coverage

- Hosted checkout network selection still needs a separate Ethereum/Polygon audit; supported wallet and execution networks are not proof of end-to-end hosted checkout support.
- Legacy passkey checkout does not use the new dynamic recovery quote.
- Circle Gateway agentic checkout still has one recipient; treasury splitting is not implemented by changing the advertised amount.
- xStocks/OKX swap fees remain separate and are not enabled by this patch.
- Durable receipt fee metadata and a versioned service-verification fee policy remain pending. Generic withdrawal compatibility endpoints are not a platform-wide fee enforcement boundary.
- Gas recovery is a quote, not the final Circle invoice. Circle service charges and taxes are not automatically included.

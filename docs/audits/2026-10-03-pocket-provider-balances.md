# Pocket provider balance reads - 2026-10-03

## Approved behavior

- Stablecoins uses authenticated, server-selected Circle wallet IDs with the Circle REST balance API. Token address, blockchain, wallet binding and decimals are validated. API keys remain server-only.
- XStocks uses OKX indexed display balances for supported stocks, X Layer USDC and native OKB. User explicitly accepted the observed approximately 0.16 percent stock quantity difference for display, provided execution remains on-chain verified.
- Stock API values are display estimates, not exact chain proofs. Their snapshots carry source=okx and null block number/hash. RPC snapshots retain actual block references. Old clients and the developer balance endpoint retain the original RPC schema/path.
- Stock send and swap signing re-read on-chain amounts, simulate/estimate transactions and verify native fee balance. XPay settlement continues to verify transfer receipts. No balance API response confirms settlement.
- Forced refreshes use RPC. Automatic reads retain the 30-second cache and in-flight deduplication. Provider failures trigger a 60-second retry cooldown with RPC fallback; failures never become zero balances.
- OKX uses the holdings inventory rather than issuing requests for all 808 catalogue contracts. Missing USDC/OKB or previously held stocks require explicit token queries. Contract decimals are fetched via RPC once per newly held stock per server process, then cached.
- Circle uses a complete, token-filtered response to establish zero, rejects unexpected tokens/precision or extra pages, and preserves the actual fetch time across cached reads. Bank routing and destination-specific execution reads remain on the existing direct path.
- The pending Stablecoins layout fix is included: Total USDC, the numeric amount and local equivalent share a centre line. The USDC suffix and visibility button no longer shift that line.

## Evidence

- Live Circle checks matched RPC for the latest sampled wallets across all six networks, including funded Polygon. A second sample matched funded Solana. One older Arc link could not be compared and is handled by fallback.
- Live OKX USDC and OKB matched RPC. A held stock differed by approximately 0.16 percent with no intervening chain balance change; both inventory and specific-token endpoints showed the difference. This is accepted display indexing behavior for this release, not a claim of exact parity.
- Scanning every catalogue token with the specific-token API hit HTTP 429; that approach is not shipped.
- Provider fixtures cover scope, precise parsing, malformed/incomplete responses, missing-token handling, cache coalescing/age, wallet revision changes, forced RPC and cooldown. Route fixtures cover Circle display selection and preserved direct bank/destination reads. OKX serialization and local display-cache roundtrips preserve source without fabricated block proof.
- Existing balance adapter/cache, developer stock balance, XStocks execution and XPay authorization/receipt/replay regressions passed. Stablecoins number/label/local-equivalent centring passed at 320/390/768px in both themes.
- Focused TypeScript comparison reported zero new diagnostics; three pre-existing diagnostics in balance/developer files remain. This is not a full-repository typecheck certification.
- Native production web build passed. No payment or trade was submitted during validation.

## Sources

- https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-token-balances
- https://web3.okx.com/onchainos/dev-docs/wallet/balance-api-all-token-balances
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/list-wallet-balance

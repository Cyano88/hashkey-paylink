# Bridge and swap fee audit — 2026-10-09

## Product rule

Own-wallet bridges and swaps must not collect Hash PayLink's 25 bps payment-service fee. Recover only the quoted gas cost actually sponsored by Hash PayLink, without a percentage markup. Provider charges remain separate pass-through costs and must not be collected twice. Existing eligible payment-service fees remain unchanged.

## Verified implementation

| Flow | Provider costs | Source gas | Treasury recovery today |
| --- | --- | --- | --- |
| USDT bridge | LI.FI/Across costs deducted from source input; quote fee is input minus expected output | Circle Gas Station | Missing |
| USDC CCTP bridge | Protocol plus destination forwarding included in CCTP maxFee | EVM source uses Circle Gas Station; Solana is a separate execution path | No separate source-gas recovery in reviewed EVM batch |
| Arc swap | LI.FI quote feeCosts; output includes the route's costs | Circle Gas Station | Missing |
| XStocks swap | OKX route may encode a disclosed positive-slippage fee | User pays OKB, including necessary approval transactions | None required for this currently unsponsored trade path |

No reviewed bridge/swap request adds an explicit Hash PayLink 25 bps integrator charge or a platform treasury transfer. The `hashpaylink` LI.FI integrator tag is not proof of fee revenue. Provider fee-recipient attribution is not established by this audit.

Evidence: `api/pocket/usdt-bridge-provider.ts`, `api/pocket/usdt-bridge.ts`, `api/pocket/cctp.ts`, `api/circle-solana-email.ts` (`executeEvmBridge`), `api/pocket/arc-swap-provider.ts`, `api/pocket/arc-swap.ts`, `api/pocket/xstocks-swap-provider.ts`, and `src/pocket/hooks/usePocketStockWallet.ts` (`trade`). The XStocks 120% gas balance check is a spending-capacity estimate, not a treasury payment.

## Required before claiming gas recovery is implemented

1. Estimate the exact sponsored batch, including its recovery transfer. Do not substitute LI.FI's router estimate for Circle's full smart-wallet batch estimate.
2. Convert the estimate into the charged token with a fresh, token-specific price; never treat USDT as USDC. Avoid native-asset assumptions across ETH, POL, Arc and Solana.
3. Bind chain, owner, token, treasury, gas estimate, amount, expiry and calldata in a server-signed quote. Do not enable arbitrary `feeBps=0` on the existing payment API to implement this exemption.
4. Show provider cost and sponsored network cost separately. Preserve minimum output and exact approved total debit. Include extra gas in Max and insufficient-balance calculations.
5. Collect only the approved recovery amount atomically with the supported source operation. Verify its token, amount and treasury recipient in receipts and reconciliation; retries must not collect again.
6. Never recover destination gas already paid through CCTP forwarding or a bridge relayer. Never recover XStocks gas while the user is already paying OKB directly.
7. A failed atomic batch can still consume sponsored gas without collecting token reimbursement. Treasury needs to account for that cost; do not retry a fee debit independently.

Treasury receipts reimburse Hash PayLink economically. They do not automatically top up Circle Gas Station billing. No new recovery debit or sponsorship funding automation was enabled by this audit.

## Verification

Existing USDT bridge validation, network-fee conversion and signed payment-fee tests passed. Their payment-service 25 bps assertions remain valid for payments and are not a bridge/swap pricing rule. No customer funds moved for this audit.

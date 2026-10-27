# BNB Chain checkout rollout

BNB checkout exposes Pocket's Privy wallet, sponsored batch, stablecoin reimbursement and canonical receipt checks. It accepts the existing Binance-pegged USDC and USDT contracts only (both 18 decimals). No native BNB checkout or bank settlement is enabled by this route.

## Activation

The implementation is gated, not automatically activated by deployment. Configure `HASHPAYLINK_BSC_CHECKOUT_ENABLED=true` and `HASHPAYLINK_BSC_CHECKOUT_PROJECTS` with the pilot project IDs only after review. It requires the existing Pocket BSC RPC, Privy credentials, quote signing secret, fee policy and `POCKET_PRIVY_COMBINED_BILLING_ENABLED=true`. Never bypass reimbursement coverage to make a payment pass.

Builders select the BNB receiving wallet and accepted USDC/USDT addresses in Settings. API requests use `rail: "bsc"` and `asset: "USDC"` or `"USDT"`; a saved BNB default also chooses this route. The ordinary hosted-checkout permissions, business verification and server-side API keys still apply.

## Validation

Fixture tests cover exact token amounts, merchant and fee transfers, wrong-chain and reorg rejection, PIN and wallet binding, cancelled unsigned attempts, concurrent submissions, uncertain broadcast recovery, ledger completion and webhook retries. Browser fixtures cover both assets, insufficient funds, cancellation and lost replies. These do not establish live provider readiness.

Before broad activation, use a named pilot app's saved receiving wallet for a reviewed live USDC and USDT payment. Verify the merchant amount, reimbursement, Privy billing coverage, payer result, developer activity and webhook. Test cancellation without broadcasting, then verify recovery after a browser reload. Record transaction references and the deployed commit before expanding the project allowlist.

## Recovery

Closing approval cancels only a prepared attempt. Submitted or uncertain operations remain reserved and are reconciled; neither UI retry nor process restart resends them. Polling and the server reconciler can recover accepted provider transactions. A missing provider reference stays pending for review rather than being labelled failed or permitting duplicate payment.

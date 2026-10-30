# Bank fee payer correction — 2026-10-30

## Confirmed failure
Pixel showed a 1,000 NGN OPay payout with 1.30 USD cash and The bank fee could not be verified. Read-only provider order lookup found initiated, amountPaid 0, amount 0.732075 USDC, senderFeePercent 0.25, senderFee 0, transactionFee 0.02, amountToTransfer 0.752075. No payment was submitted by the agent.

Paycrest documents the September 2026 default: transactionFeePayer=sender subtracts transaction cost from sender earnings. This was a policy mismatch in our integration, not evidence of an invalid provider response. Sources:
- https://docs.paycrest.io/resources/changelog#transaction-fee-payer-september-2026
- https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2

## Explicit user decision
Customer pays Paycrest's cost plus our full 0.25% fee.

The shared bank/XPay fee request now explicitly sends transactionFeePayer=customer. Treasury and 25bps rate remain unchanged; strict returned-fee validation remains intact. No account-wide provider settings changed. Shared payload covers NG/UG USDC payouts, unified XPay and the Base USDT order builder. USDT payout country restrictions remain unchanged.

## Tests
Passed: shared fee validation; USDT payload/token/precision; bank withdraw adapter and recovery; new actual create-order fixture covers NG/UG and XPay, exact total with sender fee plus transaction fee, and rejection of a provider response that still nets the fee to zero. No real provider orders were created by these tests.
Initial test harness failures were filesystem restrictions and missing mock exports; corrected and rerun. They are not product test passes.

## Pending
Deploy, refresh the actual Pixel review, confirm returned fee and total. User retains PIN approval. Funded delivery and receipt/relaunch acceptance remain open until observed.

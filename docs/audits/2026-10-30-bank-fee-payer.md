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

## Live verification
- Render dep-dbi3cfu1egvs73epq6t0 live at 2026-10-30T06:22:29Z, source e4070e312d66d7c8bd677b0e0c8fe7b30f4a220b; server build passed.
- First quote retry reused the previously rejected provider reference and returned Reference already exists. Verified the old order had amountPaid 0. Reset the unchanged 1000 NGN draft via its preset to clear the local operation key; no approval or funding occurred.
- Actual Pixel fresh review succeeded. Provider order 21b6fc35-41ae-464b-8fdf-cd69bf6c05a7 at 06:24 UTC: amount 0.732311 USDC, senderFeePercent 0.25, rounded senderFee 0.0018, transactionFee 0.02, amountToTransfer 0.754111, amountPaid 0, initiated. Pixel review shows 1000 NGN to receive, cash balance, and total 0.75 USD using the existing fiat formatter.
- Left Pixel at Confirm payment. Payment approval, fiat delivery, funded settlement and receipt recovery are not verified by this quote check.
- Follow-up: preparation failures that occur after provider creation can leave an unpersisted remote order and expose a raw duplicate-reference error on retry. Do not auto-create replacement funded attempts; reconcile remote state before any retry recovery change.

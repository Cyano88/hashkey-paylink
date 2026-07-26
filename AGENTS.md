# Hash PayLink product-truth guardrails

## Current checkout rail

- Public hosted checkout uses the current Circle-aligned wallet/session flow.
- A payer is not offered a wallet-address deposit, temporary vault address,
  ghost-vault address, or "Send via Address" option.
- Fixed checkout success is based on the exact recipient transfer. Do not add
  customer-facing underpayment or overpayment states to this controlled flow.

## Legacy manual-address rail

`PaymentPage.tsx` and the relay APIs still contain an older `direct` / `Send
via Address` implementation. It is inactive legacy code retained only as a
possible future capability if verified demand justifies a deliberate rollout.

- Do not expose, select, revive, document as current, or use this rail as the
  basis for new Pocket or hosted-checkout work.
- Do not mix its ghost-vault polling, manual-deposit reconciliation, or
  over/underpayment concepts into the current Circle checkout.
- Reactivation requires an explicit product decision plus a security,
  reconciliation, recovery, and UI review.

This boundary does not make every wallet address in the repository legacy.
Merchant treasury/recipient configuration, Pocket send/withdraw money
movement, Polymarket bridge destinations, and agent-wallet/App Pay funding are
separate current concepts and must be evaluated in their own flows.

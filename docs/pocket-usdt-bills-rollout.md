# Pocket USDT bills

USDT uses the existing Base Circle bills flow, confirmation sheet and provider
fulfilment. It does not add a separate VTpass integration or send USDT to VTpass.
VTpass continues to vend against the business's local-currency provider balance.

## Asset and recovery rules

- General USDT quotes require `POCKET_USDT_BILLS_ENABLED=true`. Public configuration
  exposes the selector only when vending and refunds are also ready. No production
  flag was enabled during this implementation.
- A temporary operator test can use `POCKET_USDT_BILLS_CANARY` with an expiring
  wallet and phone binding. It allows Nigeria airtime only, up to NGN 100 and
  0.10 USDT including the bill fee. The authenticated payer must match. The
  dedicated test APK exposes the asset selector through
  `VITE_POCKET_USDT_BILLS_CANARY`; normal production builds do not. Expiry blocks
  new quotes, while already-issued quotes retain their normal short validity.
- The quote, saved intent, payment execution, activity and refund retain USDT.
  Historical records without an asset remain USDC. Existing amount fields with
  `Usdc` names are retained for storage/API compatibility; interpret them using
  the intent's asset, not the field suffix.
- Prices use an asset-specific NGN FX quote. A USDC rate cannot price a USDT bill.
  Uganda provider pricing still converts the local product cost to NGN first.
- The existing 0.25% bill service fee is included once in the quoted token debit.
  Circle's raw transfer submits that exact debit without another platform fee.
- USDT payment requires Base USDT; it never enters the USDC CCTP funding route.
  Display balances reuse Pocket's snapshot. Payment performs a fresh balance check.
- Receipt verification checks the Base token contract, payer, treasury, amount
  and time. A USDC transfer cannot satisfy a USDT bill or refund.
- Confirmed failed/reversed purchases remain customer-claimed refunds. The same
  developer-controlled Circle treasury returns the recorded paid amount, in the
  original token, to the original payer. Provider requery, refund idempotency and
  onchain proof remain required. Background workers do not initiate refunds.
- Disabling new USDT quotes must not prevent recovery of an existing USDT bill.

## Verification, 2026-10-09

Focused tests cover USDT quote binding and rollout gates, stored-asset retry
conflicts, fee accounting, execution/ledger identity, legacy USDC compatibility,
wrong-token receipt rejection, refunds and duplicate refund prevention.
Browser fixtures exercise USDC/USDT approval and account-switch protection,
USDT refund labels, and all four bill forms at 390x844 and 390x500 in both themes.
These tests use fixtures and do not move funds.

The live Paycrest read-only recheck returned valid Base USDT/NGN rates for 1 and
2 USDT (1351.94 NGN per USDT at that check). Earlier provider unavailability was
temporary; this is not a promised rate or a permanent minimum.

Before enabling production, complete a controlled Base USDT bill purchase using
the intended Pocket account and verify provider delivery, exact debit, receipt
and activity. Verify a controlled same-token Circle treasury refund separately;
do not fabricate a failed bill or mark an uncertain provider result refundable.
No live USDT bill purchase or treasury refund was performed in this change.
The broad repository typecheck was stopped without a result; do not report it as
passed. The frontend production build and the focused runtime/browser suites are
the validation evidence for this change.

# Marketplace Paycrest zero-commission diagnosis - 2026-11-11

Scope: owner-authorized quote-only test for internal_bank_pilot_20261110_01, registered seller internal_seller_20261110, verified bank ending 9696, total available debit 1 USDC. No signing worker was enabled; no reservation or bank transfer was submitted. Live ledger was checked unchanged after each attempt.

Evidence: Paycrest returned HTTP 400 for senderFeePercent="0" (must be greater than zero), and HTTP 400 for senderFee="0" with the same constraint. Omitting both fee overrides produced an unfunded order with amount=1, senderFee=0.003, senderFeePercent=0.3, transactionFee=0.02 and rate=1380.48. Existing bank quote validation rejected it because sender commission must be zero. The provider order is unfunded and must not be funded by a manual workaround.

Transport fix: omit invalid explicit zero fields. This does NOT imply zero commission: existing quote creation and revalidation guards reject nonzero profile fees. Dedicated transport test asserts neither invalid field is sent. Quote-service and verifier tests reject inherited fees. Shared Paycrest settings were not changed because that would affect other product flows. This needs a dedicated zero-fee profile or a provider-supported zero override before bank pilot activation.

The authenticated quote-only process also needed the existing pilot gas policy explicitly supplied (maximum 0.01 USDC, 500 bps surcharge on the network fee). Production gas configuration remains a rollout prerequisite. No production environment settings were changed by this investigation.

Current balance remains 1 USDC available, 0 reserved, 0 paid. Even at zero commission, the observed provider fee requires 1.02 USDC before gas to convert the minimum 1 USDC net. Do not lower the product minimum or borrow other recipients' balances.

Reference checked: https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2 . Runtime rejects zero fixed and percentage inputs despite the documented fields; live response is the integration evidence. Unfunded order and quote request references remain in the durable quote store for reconciliation. No remote deployment as part of this diagnosis; payout gates remain off.

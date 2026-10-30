# Merchant integration recheck - 30 October 2026

## Verified now

Lunchroom project dev_d4a21d56390f4a1e8d remains settlementStatus ready with its configured receiving addresses. X Layer and BNB stablecoin options remain checked. Authenticated project response confirms webhookConfigured true and endpoint https://app.hashpaylink.com/api/demo/food/webhook. No addresses, keys or settings were changed.

Authenticated checkout API returned HTTP 200 and paid for parent chks_b11f040698b1404b8ade4132 and child chkx_e9d6d2914cf047d0b6e3c143, amount 1.5 USDT, transaction 0x5063a5b0b73b3bb1248b2769a5c5483b36e863e93986b726b3df438fb6076d70, receipt e6c65f5d-9e09-400f-b35d-4f6b99f499ef. This checkout's payment.confirmed delivery is recorded HTTP 200.

Playwright reloaded the existing merchant return page for order e30d65516361471a95d75ebe2c40ca8d and observed Your order is confirmed, 1.50 USDT on X Layer. Separately reopened the above receipt: Successful, Lunchroom, Wallet payment, X Layer, 1.50 USDT. These are separate existing records, not a newly funded test. Merchant order confirmation is not proof of physical delivery.

Handler/helper suites passed: food-hosted-checkout, food-demo-webhook, builder-integration and builder-webhook-contract. Coverage includes exact amount/asset matching, server basket, stable retry keys, parent-child mapping, webhook signatures/staleness, duplicate handling, failed-delivery retry and missed-webhook recovery. No real APIs in these fixtures.

## Open exception

The project response contains failed delivery stock-paid:chkx_985703bd2a19430896ddc48e. An older loaded dashboard displayed HTTP 503; after refresh the recorded attempt is HTTP 502 at 2026-10-30T17:36:21.573Z. Authenticated checkout status confirms a separate 0.00005 NVDAx payment is paid, receipt 803dd338-7db5-402b-8a68-63141a091ac8, transaction 0xd8139c35999ff05fe25a70ee277e708f212564d1f413fa3431a8cb93597fbbfa. No successful delivery or corresponding merchant order has been verified for this event. Do not mark it delivered, replay it blindly, clear its record, or ask the payer to pay again. Next investigation must establish the order mapping and retry state. It is not evidence of failure of the separately verified USDT checkout.

## Limits

No new payment, receipt email, key rotation, verification approval or webhook replay was performed. The older dashboard tab retained pre-release copy until refreshed; current source already contains the corrected KYC/KYB wording. Observed repeated unload-policy errors came from the Chrome automation extension; Privy connector warnings remain separate. No claim of a completely error-free system, local-fiat launch approval, or all-provider readiness.

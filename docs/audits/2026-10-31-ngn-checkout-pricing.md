# Nigerian business checkout pricing

New human checkouts for business profiles registered in NG require `currency: "NGN"` and a fixed naira amount (up to two decimal places). Personal and other-country profiles retain their existing stablecoin pricing. Existing signed orders, receipts and matching idempotent retries retain their original values.

## Payment and settlement

- A fresh Paycrest Base sell-rate reference converts the NGN price to the selected USDC or USDT amount. Integer arithmetic rounds the debit upward to six decimals. No cached rate fallback is used.
- The signed, immutable pricing snapshot includes the NGN price, token amount, asset, reference rate/market and quote timestamp. Signatures use a fixed field order to survive JSONB key reordering.
- The snapshot expires with its checkout. It is a Hash PayLink pricing reference, not a Paycrest bank-payout quote on the customer's network.
- Stablecoin settlement remains a stablecoin transfer. NGN bank settlement requests the exact NGN order price and checks the returned payout amount. Existing provider and Hash PayLink payout costs remain payable by the customer.
- Customer method selection remains separate from merchant settlement. Web checkout labels a stablecoin balance and network even when the merchant receives local currency.

## Lunchroom and receipts

Lunchroom converts its existing menu catalog using a server-stored 15-minute menu quote. It accepts only that quote identifier, calculates line totals on the server, and saves the NGN order price before creating checkout. An existing attempt is reused even after a menu refresh. Fulfillment checks the authoritative NGN price and actual stablecoin debit separately.

Web receipts, email receipts and downloaded PDFs use the saved pricing snapshot, with the actual stablecoin payment, network and merchant settlement shown separately. PDF headings use the explicit NGN code because the embedded font lacks the naira glyph. Existing receipt files are not regenerated with today's rate.

Developer settings, generated examples, API docs and the copyable server helper describe NGN order pricing. Dashboard Sandbox still simulates token payments only; the docs explicitly exclude live NGN conversion from its coverage.

## Verification

- Provider GET rate endpoints for Base USDC and USDT both returned successful positive NGN rates; no provider order or payment was submitted during that check.
- NGN arithmetic, unsupported assets, unavailable rates, expired menu quotes, original-price retries and exact provider payout matching covered by `ngn-checkout-pricing-smoke.mjs`.
- Hosted Circle, BNB and X Layer adapter suites cover new NGN pricing plus legacy behavior; selection tests cover country enforcement, supported assets and idempotent routing.
- Builder helper, Lunchroom retry, receipt rails, PDF, email and local settlement regression suites pass.
- Playwright checks at mobile and desktop widths cover Pocket/web first, then route selection, one child checkout and correct handoff. Receipt checks cover 320/390/1280 widths, light/dark, NGN price, token payment and PDF download.
- Generated PDF rendered and visually inspected; currency heading, rows and footer fit correctly.

No APK was installed or rebuilt. No new funded payment or live receipt email was triggered. A payer-approved transaction is still needed to validate this new pricing flow against live settlement and delivery.

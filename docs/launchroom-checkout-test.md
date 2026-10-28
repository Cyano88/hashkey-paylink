# Launchroom checkout setup

The demo uses the developer project selected by the server-only `FOOD_DEMO_PROJECT_KEY`.
Configure that same project, not a new unrelated app.

- Webhook URL: https://app.hashpaylink.com/api/demo/food/webhook
- Brand image URL: https://app.hashpaylink.com/brand/lunchroom.png
- The brand image must share the origin of the saved project website.
- Generate/copy the project's webhook signing secret in the developer portal and save it server-side as `FOOD_DEMO_WEBHOOK_SECRET`. Do not use an API key as the signing secret. Never place it in client code or chat.

The receiver accepts raw signed JSON, validates a five-minute delivery timestamp, persists successfully handled event IDs, and rechecks the owning project's authenticated checkout status. An unconfirmed payment returns a retryable response; a webhook alone cannot mark an order paid. Polling remains available for reconciliation.

Start the first payment test with the $1.50 Golden plantain order and Base USDC. The payer must review the full amount and reimbursement before approving. Verify the merchant order, the checkout status, the developer payment record and webhook delivery all agree. Reloading the merchant result must not create another order or payment.

New stablecoin orders use POST /api/v2/checkouts with `paymentSelection: "stablecoins"` and no fixed `asset`. The amount is the exact quantity of whichever accepted USD stablecoin the payer chooses; this does not perform FX or swaps. The API applies saved routing and branding and returns a `chks_` selection session. The payer reviews the asset and network before Continue binds one underlying payment. That payment offers Pay with Pocket and Pay on web. Local NGN/UGX settlement keeps its fixed Base USDC flow. Old fixed-asset checkout links remain unchanged. Do not treat the first Base USDC test as proof of all routes.

Use the selection session ID with authenticated `purpose=status` polling. After selection the response includes `selectedCheckoutId` and the underlying payment status. Signed payment webhooks retain the underlying `checkoutId` and include `checkoutSessionId` for order correlation. Lunchroom verifies the session status before fulfillment. Return URLs and query parameters are never evidence of payment.

Unpaid expired orders show Checkout expired, while submitted payments stay processing until authoritative confirmation. Successful checkout briefly shows its receipt and returns to the merchant automatically; the return button remains available. Already-paid checkouts remain receipts after their payment deadline.

New Lunchroom checkouts expire 15 minutes after server creation. The countdown uses the returned `expiresAt`, including across refresh and network changes; older checkout records retain their original expiry. Funding a wallet does not reset checkout expiry or complete the merchant payment.
Human checkout API defaults are also 15 minutes across Circle, BNB Chain and X Layer. Explicit valid merchant expiry settings remain supported.

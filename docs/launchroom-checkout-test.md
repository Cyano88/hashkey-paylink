# Launchroom checkout setup

The demo uses the developer project selected by the server-only `FOOD_DEMO_PROJECT_KEY`.
Configure that same project, not a new unrelated app.

- Webhook URL: https://app.hashpaylink.com/api/demo/food/webhook
- Brand image URL: https://app.hashpaylink.com/brand/lunchroom.png
- The brand image must share the origin of the saved project website.
- Generate/copy the project's webhook signing secret in the developer portal and save it server-side as `FOOD_DEMO_WEBHOOK_SECRET`. Do not use an API key as the signing secret. Never place it in client code or chat.

The receiver accepts raw signed JSON, validates a five-minute delivery timestamp, persists successfully handled event IDs, and rechecks the owning project's authenticated checkout status. An unconfirmed payment returns a retryable response; a webhook alone cannot mark an order paid. Polling remains available for reconciliation.

Start the first payment test with the $1.50 Golden plantain order and Base USDC. The payer must review the full amount and reimbursement before approving. Verify the merchant order, the checkout status, the developer payment record and webhook delivery all agree. Reloading the merchant result must not create another order or payment.

The demo's older selection adapter still limits the routes it offers. It must be updated before using Launchroom to test the full new network/asset matrix. Do not treat this first Base USDC test as proof of all routes.

# One-time checkout integration

Start at https://docs.hashpaylink.com/docs/getting-started. It explains setup, business eligibility, who handles each task, server and browser separation, webhooks, confirmation, receipt emails, recovery and launch checks.

`hashpaylink.mjs` is a copyable Node.js **server-only helper**, not a complete store. It makes no request until you call it. It exports:

- `createCheckout(order, apiKey)` — create an approved human stablecoin selection checkout and return its absolute URL.
- `verifyWebhook(rawBody, signature, webhookSecret)` — validate the original request bytes and five-minute timestamp window.
- `readOrderPayment(order, apiKey)` — read the saved checkout ID, verify exact amount and allowed asset/network, and return paid status and available receipt metadata.

- `recoverOrderPayment(order, apiKey, orders)` � verify status and call the same atomic confirmation adapter when a webhook or browser return was missed.

Use a Node.js runtime with built-in `fetch` and `AbortSignal.timeout`. Keep API keys and the separate webhook signing secret in your backend secret manager.

## Your order database

Persist `id`, customer ownership, `attemptKey`, `description`, decimal-string `amount`, `returnUrl`, `acceptedAssets`, `acceptedNetworks`, `checkoutId`, `checkoutUrl`, status, receipt/payment evidence and fulfillment status. Calculate the price on the server. Keep one unique attempt key for all retries of the same request. Save the checkout ID before returning its URL to the browser.

Implement `findByCheckoutId(id)` using a unique indexed checkout ID. Selection webhooks identify your parent ID in `data.checkoutSessionId`; direct checkout webhooks use `data.checkoutId`.

Implement `confirmAndQueueDeliveryOnce(orderId, eventId, payment, event)` in one database transaction. Lock the order, validate it against the saved terms, deduplicate the event ID and payload fingerprint, save paid status/payment evidence, and insert one delivery-queue entry keyed by order ID. A repeated matching event returns successfully; a conflicting event is flagged for investigation. A fulfillment worker delivers once and retries recoverable delivery failures. Payment and fulfillment are separate states.

Register Express's raw webhook parser before its JSON parser. Return 200 for a safely handled duplicate. Return a non-2xx status for temporary failures. On the browser return page and in a scheduled recovery job, use the same status check and atomic confirmation path. Browser navigation is never proof of payment.

## Verify locally

From the repository root:

```sh
node scripts/builder-integration-smoke.mjs
```

This tests the actual helper code with fixtures; it moves no funds. A funded human-checkout sandbox is not enabled. A live acceptance test requires project approval, enabled receiving routes, a distinct payer account, real funds and that payer's approval. Do not send a live key to a browser or substitute a test key expecting a live transfer.

## Current boundaries

The guide covers fixed one-time wallet payments. Automatic receipt emails currently cover enabled X Layer checkout with a verified purchaser email. The merchant handles products, taxes, customer support, refunds and fulfillment. Cards, automatic subscriptions and subscription invoices are outside this example. Local bank/mobile-money onboarding remains pending its flow audit, AML policy, daily limits and provider approval; no default daily allowance is implied.

Recovery uses a stable `status:CHECKOUT_ID` local evidence record. Deduplicate delivery by order ID across both webhook and recovery events. Implement `listDuePaymentChecks({limit})` and `deferPaymentCheck(orderId, error)` for bounded scheduled retries. Accepted asset/network arrays validate results; they do not override the project options offered by selection checkout.

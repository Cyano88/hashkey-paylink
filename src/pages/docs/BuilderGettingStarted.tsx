import {Link} from 'react-router-dom'
import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {DocPage,DocHeader,Section,CodeBlock,InfoBox,Code,Table,NavFooter} from './components'
import serverHelpers from '../../../examples/hosted-checkout/hashpaylink.mjs?raw'

export default function BuilderGettingStarted(){const{hash}=useLocation();useEffect(()=>{if(hash)document.getElementById(hash.slice(1))?.scrollIntoView()},[hash]);return <DocPage>
 <DocHeader title="Accept your first payment" description="Your app creates an order. Hash PayLink collects the payment. Your server confirms it and delivers what the customer bought."/>
 <Section title="Choose the right starting point" id="availability">
  <p>This guide covers <strong>one-time, fixed-amount stablecoin checkout</strong>. A stablecoin is a blockchain token designed to track a currency. Your customer pays on a page hosted by Hash PayLink and approves their own payment.</p>
  <p>This flow fits approved businesses selling products, food orders, digital downloads, tickets, bookings or a one-time service. You still manage stock, access, delivery and cancellations. These are examples of the checkout model, not automatic business approval.</p>
  <Table headers={['What you want to build','Current path']} rows={[
   ['One-time purchases','Start here. Configure a human project with Accept payments. Business review and route activation apply.'],
   ['Fund a Polymarket account','Separate product and endpoint. Eligible accounts and enabled Base/Arbitrum routes only. Payment received is not proof that account funding finished.'],
   ['Local bank / mobile-money settlement','New-builder onboarding is pending audit, AML controls, daily-limit decisions and provider approval. See the boundary below.'],
  ]}/>
  <p>Business review considers what you sell, your operating location and the payment provider’s requirements. Activities prohibited by the <Link to="/docs/terms" className="underline">Terms</Link> are not supported. Ask <a href="mailto:support@hashpaylink.com" className="underline">support@hashpaylink.com</a> about eligibility before promising a regulated or unusual use case to customers.</p>
 </Section>
 <Section title="Who does what?" id="responsibilities">
  <Table headers={['Hash PayLink handles','Your app handles']} rows={[
   ['The hosted payment page, enabled payment choices and customer approval','Your catalog, prices, inventory and customer accounts'],
   ['Checking the payment and reporting its status','Saving the order and checkout ID, then checking they match'],
   ['Signed payment notifications (webhooks) and delivery retries','An HTTPS webhook endpoint, signature checks and duplicate handling'],
   ['Payment receipts and supported automatic receipt emails','Delivering the item, unlocking access, booking the service and customer support'],
   ['Showing applicable payment fees before approval','Your invoices, tax records, refund policy and approved refund process'],
  ]}/>
  <p>You do not need to install wallet connectors or ask for a customer’s PIN, private key or sign-in code. The customer completes those steps inside checkout.</p>
 </Section>
 <Section title="1. Set up your project" id="setup">
  <ol className="list-decimal space-y-3 pl-5">
   <li>Open <a href="https://developer.hashpaylink.com" className="underline">the developer dashboard</a>, create an app, and select <strong>Accept payments</strong>.</li>
   <li>In <strong>Settings → Business details</strong>, add your name, website and what customers buy. Complete <strong>Business verification</strong> and any required review.</li>
   <li>In <strong>Receiving accounts</strong>, select stablecoin settlement, save your receiving wallet for each accepted network, and choose accepted assets. Networks are the blockchains used for payment. A wallet address must belong to the intended receiving account.</li>
   <li>Save your website’s HTTPS origin under <strong>Advanced settings</strong>. An origin is the scheme and hostname, such as <Code>https://shop.example</Code>; it does not include a path. Return URLs must use a saved origin.</li>
   <li>Save your logo under <strong>Branding</strong>. Under <strong>Receipts &amp; support</strong>, set your support inbox and timezone, then enable customer receipts if eligible.</li>
   <li>Under <strong>Developers → API keys</strong>, create a live project key. Put it in your server’s secret manager as <Code>HASHPAYLINK_API_KEY</Code>. Never put it in frontend environment variables, browser code, a mobile bundle or Git.</li>
  </ol>
  <InfoBox>Saved settings are not the same as live approval. X Layer and BNB Chain require project-specific activation. The checkout only offers routes both configured and enabled for your project.</InfoBox>
 </Section>
 <Section title="2. Save an order, then create its checkout" id="create">
  <p>Your backend is your server. It must load the product and calculate the price itself. Do not accept a price or receiving wallet supplied by the customer’s browser.</p>
  <p>Save an order before calling Hash PayLink: your order ID, customer, description, exact amount as a string, permitted assets/networks, return URL and a payment-attempt key. An <strong>idempotency key</strong> means “this is the same request again”: keep it unchanged when retrying an uncertain request.</p>
  <CodeBlock lang="bash">{`curl https://app.hashpaylink.com/api/v2/checkouts \\
  -H "X-API-Key: $HASHPAYLINK_API_KEY" \\
  -H "Idempotency-Key: order:YOUR_SAVED_ORDER_ID:1" \\
  -H "Content-Type: application/json" \\
  -d '{
    "kind": "service",
    "checkoutMode": "human",
    "paymentSelection": "stablecoins",
    "title": "Your shop order 1042",
    "amount": "1.50",
    "returnUrl": "https://shop.example/orders/1042",
    "expiresInMinutes": 15
  }'`}</CodeBlock>
  <p>Run this on your server or terminal with your real saved order and approved HTTPS return URL. The key must be 16–128 letters, digits, colons, underscores or hyphens. Expiry defaults to 15 minutes; the API accepts 5–1440 minutes.</p>
  <p><Code>paymentSelection: "stablecoins"</Code> lets the customer select from your saved routes. The amount is an exact token quantity: <Code>1.50</Code> means 1.50 of the selected stablecoin, not an FX conversion or a swap. Leave <Code>asset</Code> out of this request. Your saved accepted assets control which tokens checkout offers.</p>
  <CodeBlock lang="json">{`{
  "ok": true,
  "checkoutId": "chks_...",
  "checkoutUrl": "/pay/c/chks_...",
  "checkout": { "amount": "1.50", "status": "pending", "options": [] }
}`}</CodeBlock>
  <p>This shortened response illustrates the shape; the real response includes your available options and expiry. Save <Code>checkoutId</Code> and <Code>checkoutUrl</Code> on the order before returning the URL to the browser. Do not construct a payment URL from wallet addresses.</p>
 </Section>
 <Section title="3. Open checkout from your frontend" id="redirect">
  <p>Your frontend is the page the customer sees. It calls your own authenticated order endpoint. That endpoint checks order ownership, loads its saved price, calls Hash PayLink and returns only the checkout URL.</p>
  <CodeBlock lang="javascript — browser only">{`const response = await fetch('/api/orders/1042/checkout', {
  method: 'POST'
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Could not open checkout');
window.location.assign(result.checkoutUrl);`}</CodeBlock>
  <p><Code>/api/orders/1042/checkout</Code> is a route you implement, not a Hash PayLink endpoint. Apply your normal login, order-ownership and CSRF protections. The customer can pay on the web; installing Pocket is optional for the supported browser flow.</p>
 </Section>
 <Section title="4. Receive and verify a webhook" id="webhooks">
  <p>A webhook is a server-to-server message saying a payment changed. Create an HTTPS endpoint, save it under <strong>Developers → Webhooks</strong>, and store its signing secret as <Code>HASHPAYLINK_WEBHOOK_SECRET</Code>. This is a different secret from your API key.</p>
  <p>Verify <Code>X-HashPayLink-Signature</Code> against the <strong>original request bytes</strong>. It contains <Code>t=UNIX_SECONDS,v1=HMAC</Code>. The signature is HMAC-SHA256 over the timestamp, a period, and the raw body. Reject timestamps more than five minutes away and compare signatures safely.</p>
  <CodeBlock lang="json — payment notification shape">{`{
  "id": "stock-paid:chkx_...",
  "event": "payment.confirmed",
  "data": {
    "checkoutSessionId": "chks_...",
    "checkoutId": "chkx_...",
    "status": "paid",
    "amount": "1.5",
    "asset": "USDT",
    "network": "xlayer"
  }
}`}</CodeBlock>
  <p>For a selection checkout, find your order using <Code>data.checkoutSessionId</Code>, the ID you saved at creation. <Code>data.checkoutId</Code> is the underlying route chosen by the customer. For a direct checkout, use <Code>data.checkoutId</Code>.</p>
  <CodeBlock lang="javascript — Express routing order">{`// Register BEFORE app.use(express.json()).
app.post('/webhooks/hashpaylink', express.raw({ type: 'application/json', limit: '64kb' }),
  async (req, res) => {
    let event;
    try {
      event = verifyWebhook(req.body, req.get('X-HashPayLink-Signature'),
        process.env.HASHPAYLINK_WEBHOOK_SECRET);
    } catch { return res.sendStatus(401); }
    if (event.event !== 'payment.confirmed') return res.sendStatus(200);
    try {
      const id = event.data?.checkoutSessionId || event.data?.checkoutId;
      const order = await orders.findByCheckoutId(id);
      if (!order) return res.sendStatus(503); // save may still be in progress
      const payment = await readOrderPayment(order, process.env.HASHPAYLINK_API_KEY);
      if (!payment.paid) return res.sendStatus(503);
      // ONE database transaction: deduplicate event, mark paid, enqueue delivery.
      await orders.confirmAndQueueDeliveryOnce(order.id, event.id, payment, event);
      return res.sendStatus(200); // also return 200 for an already-handled event
    } catch { return res.sendStatus(503); }
  });
app.use(express.json());`}</CodeBlock>
  <p><Code>orders</Code> is your database adapter. Its required operations are documented with the server helpers below. Do not use an in-memory set for payment or event deduplication. Save the event ID and its payload fingerprint; treat a reused ID with different data as a conflict. A duplicate must not send another item, credit or email.</p>
  <p>Return 2xx only after you have safely stored the result or queued durable work. Return a non-2xx status for a temporary failure so Hash PayLink can retry. Check <strong>Recent deliveries</strong> in the dashboard. Do not assume every route retries forever; run your own recovery check too.</p>
 </Section>
 <Section title="5. Confirm the order on your server" id="confirm">
  <CodeBlock lang="bash">{`curl "https://app.hashpaylink.com/api/v2/checkouts?purpose=status&id=YOUR_SAVED_CHECKOUT_ID" \\
  -H "X-API-Key: $HASHPAYLINK_API_KEY"`}</CodeBlock>
  <p>Query the saved parent ID. After the customer selects a route, the response also identifies <Code>selectedCheckoutId</Code>. Require <Code>status: "paid"</Code>, the correct checkout ID, exact amount and an accepted asset/network before delivery. Keep the order pending while a payment is processing.</p>
  <Table headers={['Status','What your app should do']} rows={[
   ['pending','Show awaiting payment. Keep the existing checkout available until it expires.'],
   ['processing','Show payment being checked. Do not ask the customer to pay again.'],
   ['paid','Save verified payment details and deliver once. Show the receipt when its ID is available.'],
   ['expired / failed','Check authoritative status before offering another attempt. Preserve the original record and create a new attempt key only when safe.'],
   ['Request error / unknown','Show a recoverable status. Retry the status check with backoff; do not mark paid or create a replacement charge from uncertainty.'],
  ]}/>
  <p>The return URL is navigation, not payment proof. When the customer returns or refreshes, your page should ask your backend for the saved order status. Your backend can recheck the API using the same order-confirmation function used by your webhook. A scheduled job should also check unfinished orders in case a webhook or browser return was missed.</p>
  <p>Use a durable delivery queue: mark the order paid and enqueue its delivery in one database transaction, then let a worker fulfill it with an order-based deduplication key. This avoids losing an order if your process stops between payment and delivery.</p>
 </Section>
 <Section title="6. Receipts, emails and customer support" id="receipts">
  <p>Hash PayLink creates the payment receipt. Your business delivers the purchase. Enable customer receipts under <strong>Settings → Receipts &amp; support</strong>; set a monitored support email and timezone.</p>
  <p>Automatic email coverage in this release is confirmed X Layer wallet checkout with a verified purchaser email. It includes the merchant name/logo, PDF attachment and a direct PDF download link. Enabling it does not email old payments. Other routes and customers without a verified email are not automatically emailed by this feature.</p>
  <p>Store <Code>payment.receiptId</Code> when the status response supplies it. The web receipt is <Code>https://app.hashpaylink.com/receipt/RECEIPT_ID</Code>. For hosted X Layer receipts, the direct PDF is <Code>/api/receipt?id=RECEIPT_ID&amp;format=pdf</Code> on app.hashpaylink.com. Receipt URLs are shareable; send them only to the appropriate customer.</p>
  <p>A payment receipt is not a subscription invoice or a tax invoice. You handle tax documentation, refund requests, cancellations and order support. Contact Hash PayLink support for payment investigation; include your order ID, checkout ID and receipt ID, never a secret key or PIN.</p>
 </Section>
 <Section title="Server helpers you can copy" id="sample">
  <p>The following Node.js module implements checkout creation, signature verification and authoritative status matching. It uses built-in fetch and crypto. Save it as <Code>hashpaylink.mjs</Code> on your server and import the functions used above.</p>
  <details className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><summary className="cursor-pointer font-semibold">Show complete server helper module</summary><div className="mt-4"><CodeBlock lang="javascript">{serverHelpers}</CodeBlock></div></details>
  <p>Your order record must provide <Code>id</Code>, <Code>attemptKey</Code>, <Code>description</Code>, <Code>amount</Code>, <Code>returnUrl</Code>, <Code>acceptedAssets</Code>, <Code>acceptedNetworks</Code>, and the saved <Code>checkoutId</Code>. Keep those values stable for one attempt.</p>
  <Table headers={['Your database operation','Required behavior']} rows={[
   ['Load an owned order','Check the signed-in customer owns it; calculate the amount from your catalog.'],
   ['Save checkout result','Persist checkoutId and absolute checkoutUrl before replying to the browser. Retry creation with the SAME attemptKey if the response is lost.'],
   ['findByCheckoutId(id)','Look up the order using its unique saved checkout/session ID.'],
   ['confirmAndQueueDeliveryOnce(orderId, eventId, payment, event)','Atomic transaction: deduplicate the event, verify stored order, mark paid, save proof/receipt ID and enqueue one delivery. Repeating it is safe.'],
   ['Fulfillment worker','Deliver the product/service once, retry failed delivery, and record completion separately from payment.'],
  ]}/>
 </Section>
 <Section title="7. Test before you launch" id="test">
  <InfoBox>Test keys do not run mainnet payments, and a funded human-checkout sandbox is not enabled in this release. Test your server logic with fixtures first. A live end-to-end test uses real funds and requires an approved project and the payer’s own approval.</InfoBox>
  <ul className="list-disc space-y-2 pl-5"><li>Retry checkout creation with the same key; confirm it returns the same checkout. Changing its amount with that key must fail.</li><li>Reject invalid or stale webhook signatures; accept a valid duplicate without delivering twice.</li><li>Simulate an API timeout and a webhook retry. Preserve the order and avoid a second payment.</li><li>Confirm the amount, asset, network, order and receipt agree after a small approved payment. Use a separate payer account.</li><li>Verify webhook delivery, your actual fulfillment action, receipt/email coverage and the customer’s return to your app.</li><li>Close and reopen the order, refresh the receipt, and download its PDF. A paid order must stay paid.</li><li>Test expiry, insufficient balance, declined approval and service outages. Provide a clear recovery message.</li></ul>
 </Section>
 <Section title="When something goes wrong" id="errors">
  <Table headers={['Problem','Check this first']} rows={[
   ['400 or validation error','Amount string, required fields, key format, saved HTTPS return origin and enabled payment options.'],
   ['401 / 403','Server API key, project ownership, live/test environment, business approval and route activation.'],
   ['404 / 410','Correct saved identifier; missing or expired checkout. Recheck server status before a replacement attempt.'],
   ['409 or idempotency conflict','Reuse the original request unchanged, or deliberately create a new attempt after checking the old one. Some status wrappers also return 409 for underlying errors; read the error body.'],
   ['429','Slow down. Honor Retry-After if provided and retry with backoff. Never change the attempt key just to bypass a limit.'],
   ['5xx / timeout','Treat the outcome as unknown. Retry safely with the original key or read the existing checkout status.'],
   ['Webhook failed','Public HTTPS endpoint, correct signing secret, raw-body parser order, clock accuracy and Recent deliveries.'],
   ['Receipt email missing','X Layer eligibility, verified payer email, project receipt setting enabled before the payment, and support configuration. Contact support with the receipt ID.'],
  ]}/>
 </Section>
 <Section title="Local bank pay and limits: not open for new onboarding yet" id="local-bank">
  <p>The existing local-settlement implementation takes a supported stablecoin payment and then pays a merchant through a local provider. It is not a bank-account payment method for the customer. Nigeria bank settlement and Uganda mobile-money settlement have separate provider and identity requirements.</p>
  <p>We are holding the new-builder instructions until the local flow audit, AML/KYC controls, business eligibility, daily transaction limits, refund/recovery rules and provider approvals are settled. No universal daily allowance or local-bank launch promise is published here. Technical request caps are not an approved daily transaction limit.</p>
  <p>Continue with approved wallet settlement for this guide. If your business needs local settlement, contact support for its current review status before enabling it for customers.</p>
 </Section>
 <NavFooter prev={{label:'Overview',path:'/docs'}} next={{label:'API reference',path:'/docs/api'}}/>
</DocPage>}

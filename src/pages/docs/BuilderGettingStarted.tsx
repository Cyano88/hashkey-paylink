import {Link} from 'react-router-dom'
import {useEffect} from 'react'
import {useLocation} from 'react-router-dom'
import {DocPage,DocHeader,Section,CodeBlock,InfoBox,Code,Table,NavFooter} from './components'
import serverHelpers from '../../../examples/hosted-checkout/hashpaylink.mjs?raw'

export default function BuilderGettingStarted(){const{hash}=useLocation();useEffect(()=>{if(hash)document.getElementById(hash.slice(1))?.scrollIntoView()},[hash]);return <DocPage>
 <DocHeader title="Accept your first payment" description="Your app creates an order. Hash PayLink collects the payment. Your server confirms it and delivers what the customer bought."/>
 <nav aria-label="Integration guide sections" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium underline underline-offset-4"><Link to="#setup">Set up an app</Link><Link to="#countries">Countries and profiles</Link><Link to="#currencies">Prices and conversion</Link><Link to="#existing-builders">Existing integrations</Link><Link to="#create">Create checkout</Link><Link to="#confirm">Confirm payment</Link></nav>
 <Section title="Choose the right starting point" id="availability">
  <p>This guide covers <strong>one-time, fixed-amount stablecoin checkout</strong>. A stablecoin is a blockchain token designed to track a currency. Your customer pays on a page hosted by Hash PayLink and approves their own payment.</p>
  <p>This flow fits approved businesses selling products, food orders, digital downloads, tickets, bookings or a one-time service. You still manage stock, access, delivery and cancellations. These are examples of the checkout model, not automatic business approval.</p>
  <Table headers={['What you want to build','Current path']} rows={[
   ['One-time purchases','Start here. Configure a human project with Accept payments. Business review and route activation apply.'],
   ['Fund a Polymarket account','Separate product and endpoint. Eligible accounts and enabled Base/Arbitrum routes only. Payment received is not proof that account funding finished.'],
   ['Local bank / mobile-money settlement','Existing enabled projects only. New-builder access requires eligibility and route review. See the boundary below.'],
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
   ['Converting an NGN order price into the selected stablecoin amount using a fresh quote','Sending the correct NGN catalog price; not inventing a payment rate or trusting a browser-supplied amount'],
   ['Buyer verification and allowance checks on enabled local-settlement checkout','Accurate business/profile information and receiving accounts; your own business eligibility obligations'],
  ]}/>
  <p>You do not need to install wallet connectors or ask for a customer’s PIN, private key or sign-in code. The customer completes those steps inside checkout.</p>
 </Section>
 <Section title="1. Set up your project" id="setup">
  <ol className="list-decimal space-y-3 pl-5">
   <li>Open <a href="https://developer.hashpaylink.com" className="underline">the developer dashboard</a>, verify your email and accept the terms when prompted. A new account chooses <strong>Personal</strong> or <strong>Business</strong>, enters a full name or business name, and selects a country of residence or registration. Select <strong>Continue to Sandbox</strong>. When ready, turn on <strong>Production</strong> at the bottom of the menu and create an app with <strong>Accept payments</strong>. Use the top-right profile control to switch between Personal and your businesses. Each new dashboard app inherits its selected profile type and country.</li>
   <li>In <strong>Settings → Business details</strong>, add your name, website and what customers buy. Wallet checkout is available before verification, with normal fees. Local fiat requires personal KYC for individuals or approved KYB for businesses. Other products retain their own requirements.</li>
   <li>For a personal profile, open <strong>Settings → Verification</strong> to complete the same identity checks used in Pocket without installing the app. Use the same account on both. Nigerian local settlement requires Basic verification; Advanced is a separate Pocket verification level. Uganda uses its National ID flow. In receiving accounts, enter your own address or choose Enable Pocket wallets. Circle verifies your email when wallet setup is needed. Then choose which Pocket wallet receives payments and save your settings. Pocket wallets are optional for personal and business profiles.</li>
   <li>In <strong>Receiving accounts</strong>, select stablecoin settlement, save your receiving wallet for each accepted network, and choose accepted assets. Networks are the blockchains used for payment. A wallet address must belong to the intended receiving account.</li>
   <li>Save your website’s HTTPS origin under <strong>Advanced settings</strong>. An origin is the scheme and hostname, such as <Code>https://shop.example</Code>; it does not include a path. Return URLs must use a saved origin.</li>
   <li>Save your logo under <strong>Branding</strong>. We recommend a square 512 × 512 PNG or WebP with space around the mark so it stays clear in small Pocket activity icons. JPG is also accepted. Host the image at a public HTTPS URL on the same origin as your project website; it must load without signing in. Pocket uses your business’s first letter if the image is unavailable. Under <strong>Receipts &amp; support</strong>, set your support inbox and timezone, then enable customer receipts if eligible.</li>
   <li>Under <strong>Developers → API keys</strong>, create a live project key. Put it in your server’s secret manager as <Code>HASHPAYLINK_API_KEY</Code>. Never put it in frontend environment variables, browser code, a mobile bundle or Git.</li>
  </ol>
  <InfoBox>Saved settings are not the same as live approval. X Layer and BNB Chain require project-specific activation. The checkout only offers routes both configured and enabled for your project.</InfoBox>
 </Section>
 <Section title="Countries, profiles and receiving accounts" id="countries">
  <p>Your login, business profile and app have different jobs. One login can manage a Personal profile and multiple Business profiles. A Business profile represents a legal business with one country of registration. A project is an app under that profile, with its own keys, receiving settings and verification record.</p>
  <Table headers={['Question','Current behavior']} rows={[
   ['Which country should I choose?','Business: the country on your registration documents. Personal: your country of residence. Do not choose a customer market just to unlock its currency.'],
   ['Can I choose any country?','The profile form accepts the full country list. This records your location; it does not approve your business or enable local payment services everywhere.'],
   ['Can one profile have a second registration country?','No. A profile stores one country. Ask support to correct it. Use a separate Business profile for a different legal business.'],
   ['Can one login manage businesses in different countries?','Yes. Create a Business profile for each legal business and supply its own name, country and verification details.'],
   ['Can one app receive NGN and UGX at the same time?','No. Each project selects one settlement mode: Stablecoins, Nigeria bank, or Uganda mobile money. There is no multi-country settlement toggle for a single project.'],
   ['Can the same business have projects for different settlement routes?','The model supports separate projects under one profile. Each project needs its own receiving configuration and applicable review. A saved country or another app’s KYB approval does not automatically authorize a second route. Confirm eligibility with support.'],
  ]}/>
  <p>Business verification must use the registration country saved on the profile. Saving a country also applies it to the profile's existing apps. Profile country is not a customer-location selector, settlement currency selector or automatic approval of a payment market.</p>
  <p>The current self-service buyer identity flow supports Nigerian and Ugandan identity checks. The worldwide builder country list does not mean every country's buyers can complete local-settlement verification. Do not promise local-settlement checkout to an unsupported identity market; confirm an eligible payment route first.</p>
  <p>Current local receiving options are Nigeria bank accounts in NGN and supported Uganda mobile-money accounts in UGX, for enabled projects. Both collect Base USDC from the buyer. Uganda setup also checks the account owner's Basic identity verification, including for Business projects. Kenya local settlement is coming soon. A US profile does not enable USD bank settlement; there is no USD bank settlement mode in this checkout API.</p>
 </Section>
 <Section title="Order price, customer payment and your settlement" id="currencies">
  <Table headers={['Value','Who sets it and what it means']} rows={[
   ['Order price','Your server calculates the catalog price. Nigerian Business human checkouts require currency: NGN and an amount with at most two decimal places. This also applies when the merchant receives stablecoins.'],
   ['Customer payment','Hash PayLink calculates the required stablecoin amount and shows the asset, network, rate and fees before the customer approves. Available choices come from your project’s enabled routes.'],
   ['Merchant settlement','Your project chooses where proceeds go: a configured stablecoin wallet, Nigerian bank account, or Uganda mobile-money account. Choosing NGN as the order currency does not itself select a bank payout.'],
  ]}/>
  <p><strong>Nigerian Business example:</strong> your product costs NGN 2,000. Your server sends <Code>currency: "NGN"</Code> and <Code>amount: "2000.00"</Code>. Hash PayLink obtains a fresh Paycrest Base sell rate, calculates the required USDC or USDT for an enabled wallet-settlement route, and shows the quote. You do not calculate the checkout conversion yourself. For an enabled NGN bank-settlement route, the buyer pays Base USDC and the merchant receives the stated NGN order price after delivery is confirmed.</p>
  <p>A rate used to display an NGN-priced wallet payment is not a swap or bank payout. Hash PayLink does not route that wallet-to-wallet payment through Paycrest or add a bank-payout fee just because the price is in naira. For local settlement, Hash PayLink prepares and checks the provider payout; your app waits for the checkout's confirmed paid status before delivering the purchase.</p>
  <p><strong>Other profiles:</strong> country selection does not automatically convert catalog prices into that country's currency. Omit <Code>currency</Code> for an exact stablecoin amount, or use supported NGN pricing for human checkout. The API does not currently accept <Code>currency: "UGX"</Code>, <Code>"USD"</Code> or arbitrary local currencies. An enabled UGX settlement project receives a provider-quoted UGX payout from the stablecoin payment; UGX settlement is not UGX order pricing.</p>
  <p>Once prepared, the checkout keeps its pricing snapshot until expiry. An unavailable fresh quote stops creation rather than using a fallback rate. Store the original order price and the returned stablecoin payment details separately. Receipts retain the order currency, actual payment asset/network and applicable conversion details; earlier orders keep their original pricing.</p>
 </Section>
 <Section title="Already integrated? Keep your existing app" id="existing-builders">
  <p>Signing in with existing apps does not send you through the full first-signup form again. Select the profile that contains your app. The dashboard shows missing profile details above your apps.</p>
  <Table headers={['Existing record','Where it appears']} rows={[
   ['An app already linked to a profile','Under that saved Personal or Business profile.'],
   ['An older app explicitly marked Individual','Under Personal.'],
   ['An older app with no profile link and no Individual classification','Under a separate Business profile for that app. It is not automatically merged with your other businesses.'],
  ]}/>
  <p>If you see <strong>Business profile not set</strong>, enter the actual business name and country of registration, then select <strong>Save profile</strong>. An incomplete Personal profile asks for your full name and country of residence. The dashboard requires these details before you create another app in that profile or start verification.</p>
  <p>Completing profile details does not recreate your app or rotate its API keys. It also does not approve KYB, activate local settlement or change a saved integration mode. Existing keys remain subject to project status, receiving setup, verification and route checks. Profile type and payment access are separate.</p>
  <p><strong>Wrong profile type?</strong> Complete the intended Personal or Business profile under the same login, then contact support with your app ID. An Owner or Compliance reviewer can move the existing app between those profile types. You do not need a duplicate app. Its ID, keys, webhooks and payment history stay intact; other apps do not move. New payments pause for review, previous KYC/KYB approval does not transfer, and local receiving details must be verified again. Moving to a Nigerian Business profile also makes NGN pricing required for new human checkouts.</p>
  <InfoBox>Before setting an existing Business profile to Nigeria, update your server to send <Code>currency: "NGN"</Code> and an NGN order price for new human checkouts. Saving the country applies it to that profile's apps. Existing orders and receipts keep their original pricing.</InfoBox>
  <p>The older project-creation API still accepts requests without a profile ID for compatibility and defaults those projects to Business. This is not evidence of completed onboarding or business verification. Use the dashboard to complete the profile attached to an existing app.</p>
 </Section>
 <Section title="2. Save an order, then create its checkout" id="create">
  <p>Your backend is your server. It must load the product and calculate the price itself. Do not accept a price or receiving wallet supplied by the customer’s browser.</p>
  <p>Save an order before calling Hash PayLink: your order ID, customer, description, exact amount as a string, permitted assets/networks, return URL and a payment-attempt key. An <strong>idempotency key</strong> means “this is the same request again”: keep it unchanged when retrying an uncertain request.</p>
  <p>For a Nigerian business profile, your catalog and saved order must use NGN. Add <Code>"currency": "NGN"</Code> and set <Code>amount</Code> to the naira price, for example <Code>"2000.00"</Code>. Checkout converts that order price into the selected stablecoin. Your receiving currency remains the one configured in your project.</p>
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
  <p><Code>paymentSelection: "stablecoins"</Code> lets the customer select from your saved routes. Without <Code>currency</Code>, for profiles that allow stablecoin pricing, the amount is an exact token quantity: <Code>1.50</Code> means 1.50 of the selected stablecoin, not an FX conversion or a swap. Leave <Code>asset</Code> out of this request. Your saved accepted assets control which tokens checkout offers.</p>
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
  <p>Query the saved parent ID. After the customer selects a route, the response also identifies <Code>selectedCheckoutId</Code>. Require <Code>status: "paid"</Code>, the correct checkout ID, exact order price and an accepted asset/network before delivery. For NGN orders, match <Code>pricing.currency</Code> and <Code>pricing.amount</Code>; record the actual stablecoin amount separately. Keep the order pending while a payment is processing.</p>
  <Table headers={['Status','What your app should do']} rows={[
   ['pending','Show awaiting payment. Keep the existing checkout available until it expires.'],
   ['processing','Show payment being checked. Do not ask the customer to pay again.'],
   ['paid','Save verified payment details and deliver once. Show the receipt when its ID is available.'],
   ['expired / failed','Check authoritative status before offering another attempt. Preserve the original record and create a new attempt key only when safe.'],
   ['Request error / unknown','Show a recoverable status. Retry the status check with backoff; do not mark paid or create a replacement charge from uncertainty.'],
  ]}/>
  <p>The return URL is navigation, not payment proof. When the customer returns or refreshes, your page should ask your backend for the saved order status. Your backend can recheck the API using the same order-confirmation function used by your webhook. A scheduled job should also check unfinished orders in case a webhook or browser return was missed.</p>
  <p>Your return page and a scheduled worker should call the same recovery helper. It reads authenticated payment status before storing confirmation; it does not create another checkout or charge.</p>
  <CodeBlock lang="javascript - server recovery">{`import {recoverOrderPayment} from './hashpaylink.mjs';

// In your order-status endpoint: first authenticate the customer and verify ownership.
const payment = await recoverOrderPayment(order, process.env.HASHPAYLINK_API_KEY, orders);
// Return your saved order's public status to that customer.

// In a scheduled worker: list orders whose payment check is due, with a bounded batch.
for (const order of await orders.listDuePaymentChecks({limit: 100})) {
  try {
    await recoverOrderPayment(order, process.env.HASHPAYLINK_API_KEY, orders);
  } catch (error) {
    // Save the error and next retry time with backoff. Do not mark paid or failed.
    await orders.deferPaymentCheck(order.id, error.message);
  }
}`}</CodeBlock>
  <p>The helper uses a stable <Code>status:CHECKOUT_ID</Code> recovery record. Your database must still allow only one delivery per order, even when a webhook and recovery run together. Do not stop recovery merely because the browser timer expired: check authoritative status first. Keep payment confirmation separate from whether your delivery worker finished. Once your database has confirmed an order as paid, a later timeout or pending response must not downgrade it.</p>
  <p>Use a durable delivery queue: mark the order paid and enqueue its delivery in one database transaction, then let a worker fulfill it with an order-based deduplication key. This avoids losing an order if your process stops between payment and delivery.</p>
 </Section>
 <Section title="6. Receipts, emails and customer support" id="receipts">
  <p>Hash PayLink creates the payment receipt. Your business delivers the purchase. Enable customer receipts under <strong>Settings → Receipts &amp; support</strong>; set a monitored support email and timezone.</p>
  <p>Automatic emails cover supported human Checkout networks when the purchaser signs in with a verified email before paying. Bank or mobile-money settlement must also be confirmed before the receipt is sent. It includes the merchant name/logo, PDF attachment and a direct PDF download link. Enabling it does not email old payments. Customers without a verified email are not automatically emailed.</p>
  <p>Store <Code>payment.receiptId</Code> when the status response supplies it. The web receipt is <Code>https://app.hashpaylink.com/receipt/RECEIPT_ID</Code>. For hosted Checkout receipts, the direct PDF is <Code>/api/receipt?id=RECEIPT_ID&amp;format=pdf</Code> on app.hashpaylink.com. Receipt URLs are shareable; send them only to the appropriate customer.</p>
  <p>A payment receipt is not a subscription invoice or a tax invoice. You handle tax documentation, refund requests, cancellations and order support. Contact Hash PayLink support for payment investigation; include your order ID, checkout ID and receipt ID, never a secret key or PIN.</p>
 </Section>
 <Section title="Server helpers you can copy" id="sample">
  <p>The following Node.js module implements checkout creation, signature verification and authoritative status matching. It uses built-in fetch and crypto. Save it as <Code>hashpaylink.mjs</Code> on your server and import the functions used above.</p>
  <details className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><summary className="cursor-pointer font-semibold">Show complete server helper module</summary><div className="mt-4"><CodeBlock lang="javascript">{serverHelpers}</CodeBlock></div></details>
  <p>Your order record must provide <Code>id</Code>, <Code>attemptKey</Code>, <Code>description</Code>, <Code>amount</Code>, <Code>returnUrl</Code>, <Code>acceptedAssets</Code>, <Code>acceptedNetworks</Code>, and the saved <Code>checkoutId</Code>. For Nigerian businesses also save <Code>currency: "NGN"</Code>. Keep those values stable for one attempt. The accepted assets and networks must cover the project routes offered for that order; these arrays validate the result, they do not restrict checkout choices. Selection checkout uses your saved project settings.</p>
  <Table headers={['Your database operation','Required behavior']} rows={[
   ['Load an owned order','Check the signed-in customer owns it; calculate the amount from your catalog.'],
   ['Save checkout result','Persist checkoutId and absolute checkoutUrl before replying to the browser. Retry creation with the SAME attemptKey if the response is lost.'],
   ['findByCheckoutId(id)','Look up the order using its unique saved checkout/session ID.'],
   ['confirmAndQueueDeliveryOnce(orderId, eventId, payment, event)','Atomic transaction: deduplicate the event, verify stored order, mark paid, save proof/receipt ID and enqueue one delivery. Repeating it is safe.'],
   ['listDuePaymentChecks / deferPaymentCheck','List a bounded batch of unfinished payments and persist retry times with backoff. A temporary API error must not create a new attempt.'],
   ['Fulfillment worker','Deliver the product/service once, retry failed delivery, and record completion separately from payment.'],
  ]}/>
 </Section>
 <Section title="7. Test before you launch" id="test">
  <InfoBox>The dashboard Sandbox simulates checkout states and generates signed webhook fixtures. Test keys only work at /api/developer-projects?resource=sandbox, with the example shown in the dashboard. It does not create a hosted payment page, move funds, deliver webhooks or receipts, or test live NGN conversion, local fiat and provider compliance. The code above is for production. A real end-to-end test needs configured, enabled routes and the payer’s own approval.</InfoBox>
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
   ['Receipt email missing','Human Checkout eligibility, verified payer email, project receipt setting enabled before the payment, and support configuration. Contact support with the receipt ID.'],
  ]}/>
 </Section>
 <Section title="Local bank pay and limits: not open for new onboarding yet" id="local-bank">
  <p>The existing local-settlement implementation takes a supported stablecoin payment and then pays a merchant through a local provider. It is not a bank-account payment method for the customer. Nigeria bank settlement and Uganda mobile-money settlement have separate provider and identity requirements.</p>
  <p>For an enabled hosted local-settlement route, the buyer needs Basic verification and can complete it inside web checkout. A verified Pocket identity is reused when the buyer signs in with the same account. Completing verification returns the buyer to payment review; it does not approve or send a payment.</p>
  <p>These checkouts now have one daily allowance per buyer across merchants, based on the current payout capacity shown in Pocket. It is not a fixed 6,992 USDC limit and does not raise Pocket withdrawal limits. See <Link to="/docs/compliance#checkout-limits" className="underline">how checkout limits, retries and refunds are counted</Link>.</p>
  <p>This implementation update does not open local settlement to every new builder. Business eligibility, route activation and provider approval remain separate. Do not collect identity documents in your own checkout or call Pocket's internal verification endpoints; Hash PayLink handles the buyer's verification step.</p>
  <p>Continue with approved wallet settlement for this guide. If your business needs local settlement, contact support for its current review status before enabling it for customers.</p>
 </Section>
 <NavFooter prev={{label:'Overview',path:'/docs'}} next={{label:'API reference',path:'/docs/api'}}/>
</DocPage>}

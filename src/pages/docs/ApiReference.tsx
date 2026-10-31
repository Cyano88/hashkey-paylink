import {DocPage,DocHeader,Section,CodeBlock,Table,Code,NavFooter} from './components'
import {Link} from 'react-router-dom'
export default function ApiReference(){return <DocPage>
<DocHeader title="Checkout API" description="Create a fixed-amount checkout, read its payment status, and match the result to your order."/>
<Section title="Authentication"><p>Call <Code>https://app.hashpaylink.com</Code> from your server. Send your live project key in <Code>X-API-Key</Code>. Configure accepted assets, receiving wallets and HTTPS return origins in the developer dashboard. The <Link to="/docs/getting-started" className="underline">integration guide</Link> includes the complete order and webhook flow.</p></Section>
<Section title="Create a checkout" id="create"><CodeBlock lang="text">{'POST /api/v2/checkouts'}</CodeBlock>
<Table headers={['Field','Value and meaning']} rows={[
['kind','service'],['checkoutMode','human'],['paymentSelection','stablecoins — offers your saved, enabled token/network choices'],['title','Order description; up to 100 characters'],['currency','NGN is required for Nigerian business profiles. Omit for other profiles using exact stablecoin pricing.'],['amount','With currency NGN: the order price in naira, a positive decimal string with up to 2 decimal places. Without currency: an exact stablecoin quantity up to 100000 with up to 6 decimal places. Payment access and route limits still apply.'],['returnUrl','HTTPS URL whose origin is saved on your project'],['expiresInMinutes','Whole number from 5 to 1440; defaults to 15']
]}/>
<p>Send <Code>Idempotency-Key</Code>: 16–128 letters, digits, colons, underscores or hyphens. Keep the same key and request body when retrying one order attempt. A changed request using the same key is rejected. The selection request does not accept an asset, network or recipient override; those come from the saved project settings.</p>
<CodeBlock lang="javascript">{`const response = await fetch('https://app.hashpaylink.com/api/v2/checkouts', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.HASHPAYLINK_API_KEY,
    'Idempotency-Key': order.attemptKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    kind: 'service', checkoutMode: 'human', paymentSelection: 'stablecoins',
    title: order.description, amount: order.amount,
    ...(order.currency ? {currency: order.currency} : {}),
    returnUrl: order.returnUrl, expiresInMinutes: 15
  })
});
const checkout = await response.json();
if (!response.ok || checkout.ok === false) throw new Error(checkout.error || 'Checkout failed');
const checkoutUrl = new URL(checkout.checkoutUrl, 'https://app.hashpaylink.com').toString();
// Save checkout.checkoutId and checkoutUrl on the order before returning the URL.`}</CodeBlock>
<p>Calculate the amount from your own catalog and authenticate the customer before this call. A successful response contains <Code>checkoutId</Code> starting with <Code>chks_</Code>, a <Code>checkoutUrl</Code> and the checkout details. Save the parent ID; the payer's later route selection is represented by a separate child checkout.</p>
</Section>
<Section title="Nigerian business pricing"><p>Save your catalog and order prices in NGN, then send <Code>currency: "NGN"</Code> and, for example, <Code>amount: "2000.00"</Code>. The customer sees the NGN price, chooses Pocket or web checkout, and selects an enabled USDC or USDT route. Checkout shows the stablecoin amount, exchange rate and applicable fees before approval.</p><p>Order currency does not change your receiving account. Stablecoin settlement stays in stablecoins. An enabled Nigerian bank payout delivers the stated NGN order price; the customer pays the required USDC and disclosed costs. A merchant bank payout is not a customer bank-transfer method.</p><p>We use a fresh Paycrest Base sell rate as the NGN reference when preparing the selected payment. This does not route a wallet-to-wallet payment through Paycrest or add a bank-payout fee. The pricing snapshot stays fixed for that checkout and expires with it. It is not a guaranteed Paycrest bank quote on other networks. If a fresh rate is unavailable, creation fails without a fallback rate.</p><p>After selection, <Code>pricing</Code> contains <Code>currency</Code>, <Code>amount</Code>, <Code>paymentAmount</Code>, <Code>paymentAsset</Code>, <Code>rate</Code>, <Code>source</Code>, <Code>referenceNetwork</Code> and <Code>quotedAt</Code>. Match <Code>pricing.currency</Code> and <Code>pricing.amount</Code> to your saved order; the payment amount is the actual stablecoin amount, which may include local payout costs. Keep both values. Older orders and receipts retain their original pricing.</p></Section>
<Section title="Read payment status" id="status"><CodeBlock lang="bash">{`curl "https://app.hashpaylink.com/api/v2/checkouts?purpose=status&id=YOUR_SAVED_CHECKOUT_ID" \\
  -H "X-API-Key: $HASHPAYLINK_API_KEY"`}</CodeBlock>
<p>Use the same project's server key and the saved parent ID. Once a route is selected, <Code>selectedCheckoutId</Code> identifies its child. Require <Code>status: paid</Code> and match the ID, order price, accepted asset and network before delivery. For NGN orders, compare the stored NGN price to <Code>pricing.amount</Code>, not to the stablecoin transfer amount.</p>
<Table headers={['Status','Action']} rows={[
['pending','Keep the order awaiting payment.'],['processing','Payment is being checked. Do not request another payment.'],['paid','Save the verified payment and queue delivery once.'],['expired / failed','Recheck authoritative status before offering a new attempt.'],['Request error or unknown','Retry the status check with backoff; do not infer paid or failed.']
]}/><p>A return URL or a screenshot is not payment proof. Read status on the return page through your backend and from a scheduled recovery job for unfinished orders.</p></Section>
<Section title="Payment notifications" id="webhooks"><p>Save your HTTPS webhook endpoint in Developers → Webhooks. Verify <Code>X-HashPayLink-Signature</Code> using the separate signing secret. The header is <Code>t=UNIX_SECONDS,v1=HMAC</Code>; sign the timestamp, a period, and the original request bytes with HMAC-SHA256. Reject signatures more than five minutes old or in the future.</p><p>For <Code>payment.confirmed</Code>, map <Code>data.checkoutSessionId</Code> to your saved parent ID and verify paid status through the API. <Code>data.checkoutId</Code> identifies the selected child. Persist event IDs and acknowledge matching duplicates with HTTP 200 without delivering twice. Store confirmation and the delivery job atomically before acknowledging.</p><Link to="/docs/getting-started#webhooks" className="underline">Copy the signature verifier and webhook handler</Link></Section>
<Section title="Receipts"><p>When status supplies <Code>payment.receiptId</Code>, the web receipt is <Code>https://app.hashpaylink.com/receipt/RECEIPT_ID</Code>. Supported human Checkout receipts also support <Code>/api/receipt?id=RECEIPT_ID&amp;format=pdf</Code>. Treat receipt links as shareable customer information.</p><p>Automatic receipt emails require a confirmed human Checkout payment and any required local delivery, a verified payer email and the project's customer receipt setting enabled before payment. The merchant handles delivery, refunds, order support and tax invoices.</p></Section>
<Section title="Errors and retries"><p>Read both the HTTP status and JSON error message. Validation and idempotency conflicts in selection checkout can return 409. Authentication, ownership or activation failures require checking your project configuration. On timeout, preserve the original attempt key and check status before retrying. On 429, honor Retry-After when present and use backoff.</p><Link className="underline" to="/docs/getting-started#errors">Troubleshoot checkout and webhook errors</Link></Section>
<NavFooter prev={{label:'Accept your first payment',path:'/docs/getting-started'}} next={{label:'Polymarket funding',path:'/docs/funding'}}/>
</DocPage>}

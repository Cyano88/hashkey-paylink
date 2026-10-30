import BuilderGuideLinks from './BuilderGuideLinks'
export default function BuilderQuickstart({returnOrigin,hasFunding}:{returnOrigin:string;hasFunding:boolean}){
 const server=`// Your backend: authenticate the customer and load their saved order first.
// Calculate order.amount from your catalog, not from browser input.
const response = await fetch('https://app.hashpaylink.com/api/v2/checkouts', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.HASHPAYLINK_API_KEY,
    'Idempotency-Key': order.attemptKey, // keep this key for retries
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    kind: 'service', checkoutMode: 'human', paymentSelection: 'stablecoins',
    title: order.description, amount: order.amount,
    returnUrl: ${JSON.stringify(returnOrigin+'/complete')}, expiresInMinutes: 15
  })
});
const checkout = await response.json();
if (!response.ok || checkout.ok === false) throw new Error(checkout.error || 'Checkout failed');
checkout.checkoutUrl = new URL(checkout.checkoutUrl, 'https://app.hashpaylink.com').toString();
// Persist checkout.checkoutId and checkout.checkoutUrl on your order BEFORE replying.
// Return the absolute checkout URL to your frontend. Never return the API key.`
 const browser=`// Your frontend calls YOUR backend route, not the Hash PayLink API.
const response = await fetch('/api/orders/1042/checkout', { method: 'POST' });
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Could not open checkout');
window.location.assign(result.checkoutUrl);`
 return <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Integration</p><h1 className="mt-2 text-2xl font-semibold">Connect your app</h1><p className="mt-3 text-sm leading-6 text-gray-500">Start with one saved order and one checkout. Hash PayLink collects payment; your app delivers the purchase.</p>
 <BuilderGuideLinks/>
 {[['1. Server only',server],['2. Browser only',browser]].map(([label,code])=><section key={label} className="mt-6"><h2 className="text-sm font-semibold">{label}</h2><pre className="mt-3 overflow-x-auto rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-white">{code}</pre></section>)}
 <section className="mt-6 space-y-3 text-sm leading-6 text-gray-500"><h2 className="font-semibold text-gray-950 dark:text-white">3. Confirm, then deliver once</h2><p>Set up your signed webhook in Developers → Webhooks. Map checkoutSessionId to your saved order, then check its status using your server key. A redirect alone does not prove payment.</p><p>Save paid status and queue delivery in one database transaction. Repeated notifications must not deliver the order twice. The full guide includes the signature verifier, status check, required database operations and launch checklist.</p><p>If a webhook or browser return is missed, run the <a href="https://docs.hashpaylink.com/docs/getting-started#confirm" className="underline">server recovery helper</a> from your order-status endpoint and a scheduled worker. Both must use the same order-based delivery deduplication.</p><p>Human checkout uses live approved routes; test keys do not provide a funded sandbox. X Layer and BNB Chain require separate project activation.</p></section>
 {hasFunding&&<p className="mt-6 text-sm leading-6 text-gray-500">For your separate Polymarket funding product, follow the <a href="https://docs.hashpaylink.com/docs/funding" className="underline">funding API reference</a>. Account funding completion is distinct from checkout payment confirmation.</p>}
 </div>
}

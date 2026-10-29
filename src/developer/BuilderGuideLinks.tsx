export default function BuilderGuideLinks(){return <section className="mt-6 space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-white/10" aria-label="Integration checklist">
 <h2 className="text-base font-semibold">Your integration, in order</h2>
 <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-gray-600 dark:text-gray-400">
 <li>Save your receiving wallets, accepted assets and website in Settings. Complete business review and any route activation.</li>
 <li>Create an API key under Developers → API keys. Keep it on your server.</li>
 <li>Create one checkout for a saved order. Save its ID, then send the customer to its checkout URL.</li>
 <li>Verify signed webhooks and check payment status from your server. Deliver the order once after it is paid.</li>
 <li>Set your support email under Settings → Receipts &amp; support. Test payment, email, receipt and return to your app.</li>
 </ol>
 <p className="text-sm leading-6 text-gray-500">Hash PayLink handles the payment page, customer approval, payment verification and supported receipts. You handle prices, customer accounts, stock, delivery, refunds and customer support.</p>
 <a href="https://docs.hashpaylink.com/docs/getting-started" className="inline-flex min-h-11 items-center font-semibold text-blue-600 dark:text-blue-300">Follow the complete integration guide →</a>
 <p className="text-xs leading-5 text-gray-500">Local bank and mobile-money settlement onboarding is pending its audit, AML policy and daily-limit decisions. Card payments and automatic subscriptions are not enabled by this guide.</p>
</section>}

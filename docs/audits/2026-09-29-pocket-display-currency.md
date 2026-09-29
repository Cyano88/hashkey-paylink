# Pocket display currency audit - 2026-09-29

Stablecoins offers USDC (default), NGN and UGX. USDC remains the main balance, confirmation, activity and Pocket receipt amount. NGN/UGX display estimates use Paycrest sell quotes and never change payment amounts, fees, networks or eligibility. Bank/bill inputs and delivery details keep their actual local denomination. Historical receipts retain their recorded delivery value; exports do not invent historical FX rates.

The Basic cap remains NGN 50,000 in the server ledger, shown as an approximate USDC allowance and the selected local equivalent. Bills remain excluded from that KYC allowance. Profile shows Verified only when its server-projected nameStatus is kyc_verified. Advanced eligibility is unchanged.

Paycrest quotes are validated against the requested currency and amount. NGN and UGX have separate backend caches; clients share requests by currency/amount and hide stale or expired rates. Old GHS/KES display preferences normalize to USDC. XStocks keeps an independent preference.

Validation: display-currency, profile-adapter, bill-activity-consistency, Uganda-POS and KYC-identity smoke tests passed. Public Paycrest NGN and UGX rate endpoints returned HTTP 200 with success. Mobile-width component previews verified default/NGN/UGX and light/dark layouts with no console errors. Production Vite build and Android debug build passed. Scoped TypeScript validation has one existing missing lucide-react declaration in PocketPayLinkFields; the other changed files passed. The broad circle-pocket-contracts suite stops on an obsolete expectation that Polygon is unsupported; this assertion was not changed as part of currency work. No live purchases or transfers were made.

VTpass: Pocket's existing TV vending path accepts service ID, smartcard, package and NGN price, with no Uganda TV corridor. Public TV API documentation does not establish Uganda decoder support. VTpass's published Uganda coverage found during this audit is international airtime. Do not enable or advertise Uganda TV until VTpass confirms the service/account scope and a controlled validation succeeds.

Sources:
- https://vtpass.com/documentation/tv-subscription-api/
- https://vtpass.com/blog/buy-international-airtime-for-these-countries-on-vtpass/

Loading follow-up: limits, equivalents, amount-entry estimates and rate panels use compact existing Pocket skeleton bars. Available values remain visible during background refresh. FX requests time out after 15 seconds; stale provider responses are treated as unavailable rather than loading forever.

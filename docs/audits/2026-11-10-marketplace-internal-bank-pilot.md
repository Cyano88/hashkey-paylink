# Marketplace internal bank pilot wiring — 2026-11-10

## Scope

Base USDC accumulated withdrawals to verified Nigerian banks, behind separate `MARKETPLACE_BANK_PAYOUTS_ENABLED` and `MARKETPLACE_BANK_WORKER_ENABLED` flags. Both remain false at this checkpoint. No payment or bank provider order was created by this work.

- Added Paycrest v2 order transport reusing current authentication, with explicit zero sender commission and customer-paid provider transaction fee. Existing checkout/POS fees are unchanged.
- Durable quote requests precede provider I/O. Lost create responses are not retried. Only the final validated quote can be reserved; unused unfunded quote orders expire. At most three attempts reconcile principal plus provider fee plus gas to the exact requested debit. NGN and token arithmetic uses integers.
- Submission rechecks current seller identity/bank resolution, authority, backing, provider terms and gas coverage. Every pooled source must have the correct verified holding collection.
- Circle attempt/refId are durable before sending. Recovery queries the existing reference; no blind resend. Only canonical finalized exact Base USDC outflow plus final provider settlement credits bank success. Reverted funding restores balances. Provider failures/refunds without verified returned funds remain reserved for review.
- Connected bank quote/reservation and receipt API routes, fair worker cursor, redacted worker health, NGN bank receipt/email projection and seller-owned email resolution. No repeated bank destination field.
- Fixed Marketplace-only live-key setup: unique admin approval plus current individual KYC or approved business verification are required. Ordinary checkout routing is not needed for Marketplace-only keys. Mixed-product/ordinary checkout rules remain unchanged; generic checkout authorization still excludes Marketplace capabilities.

## Verification

44 Marketplace regression suites ran. All assertions passed; Windows terminated the HTTP runner with UV_HANDLE_CLOSING after its pass message. Rerunning with a 250 ms shutdown drain passed. The additional Marketplace key-access suite passed (45 Marketplace suites in total).

Targeted developer production-access and developer-project adapter suites passed. The latter contained a stale onboarding expectation that Marketplace app creation must fail; its retired-product check was corrected. Targeted pooled bank API and receipt suites passed after wiring changes.

Focused TypeScript diagnostics passed for 38 files. Vite production build passed (existing dependency annotation and large-chunk warnings). Seller and docs browser tests passed at 320/390/1280 in light/dark; a sandbox filesystem denial required an approved rerun outside that sandbox. Fixtures mock authentication, KYC, provider and blockchain responses; they are not a funded bank settlement.

## Internal pilot readiness

Verified the exact existing account `onojacyano@gmail.com` using Privy and current production Advanced NG KYC. Existing app `dev_e2174e665ad74b3582` is owned by that account and has approved Marketplace access. Created a dedicated internal API key through the developer handler; secret is not committed or printed. Provisioned dedicated bank-record encryption and enabled seller setup only for the approved internal app. Bank quote and worker activation remain disabled.

Remaining live acceptance: seller signs in and connects their account, registers a matching bank through hosted verification, funds a new real order sufficient for 1 USDC net conversion plus quoted fees, and confirms bank arrival. Do not fabricate identity consent, beneficiary ownership, ledger funding or receipt success. Automatic provider-return restoration remains deliberately unavailable until a canonical return transaction can be bound to the provider order; ambiguous/partial outcomes retain reservations.

Provider references checked: https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2 and https://docs.paycrest.io/api-reference/sender/get-payment-order-by-id-v2 .

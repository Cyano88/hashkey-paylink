# Bank payout audit checkpoint — 2026-10-30

Status: read-only/provider and regression checks passed; funded acceptance and AML/provider approval remain OPEN. No payment, refund, PIN approval, limit/config change, or provider order creation was performed.

## Current evidence
- Release checkout: hashpaylink-exchange-push-release, deployed source 0b8592b23415fa0e6b50cfbb74052cd47c948da7. Native source/build is separate; do not infer installed source parity.
- Paycrest read-only checks at 06:01 UTC: NGN and UGX rejected 0.499999 USDC with 404 route-unavailable, quoted 0.5 and 1 USDC with 200. Snapshot rates 1365.78 NGN and 4342.1 UGX per USDC imply local minimum 682.89 NGN / 2171.05 UGX before fees. These are time-specific quotes, not fixed limits or proof of delivery.
- Institutions: 174 NGN bank entries and 2 UGX mobile-money entries, HTTP 200.
- Base USDT-to-NGN 1 USDT rate returned HTTP 200. Code restricts USDT direct payouts to Nigeria; do not advertise USDT Uganda payout support from quote APIs alone.
- Production Paycrest key/webhook secret configured. USDT payout flag true. Canary configuration exists but global true takes precedence. No secrets, wallets or account details recorded.
- Advanced daily limit setting absent; current code fallback remains 50,000 NGN equivalent for eligible accounts. Shared NG/UG allowance, Lagos-day reset, no weekly cap established. This is existing implementation, not a newly approved policy.
- Platform sender fee is 25 basis points, explicitly set and checked against provider response; exact total requires a fresh order review, including provider/network fees.
- Pixel opened through Send → Bank transfer. Nigeria recipient form and saved-recipient list render. No recipient selected. Home cash balance displayed 0.33 USD, insufficient for the observed 0.5-USDC minimum before fees; other asset balances are not assumed to be spendable cash.

## Passed regression checks
1. paycrest-provider-boundaries-smoke: live-derived minimum logic, upward rounding, outages distinct.
2. pocket-kyc-transfer-limits-smoke: production KYC evidence, concurrent shared cap, exact boundaries, original FX on retry, safe release rules, Lagos midnight.
3. pocket-bank-uganda-payout-smoke: country/currency/phone normalization and retry binding.
4. pocket-bank-withdraw-adapter-smoke: payout API/recovery; USDT rollout/asset binding/bridge exclusion.
5. paycrest-order-state-smoke: stale reads cannot downgrade completion or replace current quote.
6. paycrest-reconcile-policy-smoke: reconciliation terminal/recovery rules.
7. pocket-bank-receipt-refresh-smoke: pending receipt refreshes to Delivered, stale data cannot regress.
8. pocket-usdt-bank-parity-smoke: asset-bound estimates/cache without USDC fallback.
9. pocket-bank-amount-entry-browser-smoke: real controller entry, presets, notes, reset and keyboard layout.
10. pocket-bank-preparation-error-browser-smoke: retryable errors preserve details, no false failed receipt.

## Remaining acceptance
- User selection required: recipient, country and maximum total spend. Asked asynchronously; no answer yet.
- Fund wallet if required, review the exact quote and total, then user completes payment approval. Record one intent/provider order/transaction through processing, recipient delivery, final settlement, relaunch and reopened receipt. Never resubmit an ambiguous payment.
- Refund/recovery fixture passes do not establish real refund delivery; a live refund drill needs a suitable provider-supported scenario.
- Provider arrangement/approval evidence, adopted AML policy, route eligibility, sanctions/monitoring/escalation responsibilities and final daily/velocity policy remain separate gates before developer bank onboarding. Do not increase limits or infer approval from successful quotes or merchant KYB.
- Collections remains deferred and is not an open activation task.
- Pixel country switch verified: Uganda shows Mobile money number and Provider, filters Recent to Uganda, and renders the Airtel icon. No recipient or amount selected.

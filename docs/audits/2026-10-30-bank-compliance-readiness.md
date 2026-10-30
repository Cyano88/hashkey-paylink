# Bank payments and compliance readiness � 2026-10-30

Status: audit checkpoint; NOT approval to launch developer bank settlement or increase limits.
Source reviewed: d7105f85d484ed13ca55383a8875ccf9a09faac0 (audit-only follow-up cf24999ef). No payment orders, transfers, refunds, provider settings or limits changed by this review.

## Verified scope

| Route | Implementation evidence | Remaining release boundary |
| --- | --- | --- |
| Pocket NGN bank payout | Base USDC; direct USDT enabled, Nigeria-only; production KYC and shared allowance checks | Provider approval evidence, funded delivery/receipt confirmation |
| Pocket UGX mobile money | USDC route; normalized numbers and bound country/currency | Provider approval and funded delivery evidence; no USDT promise |
| XPay local payout | Explicit customer fee payer; full 0.25% fee; allowance reservation at checkXPayPayout | Same policy/provider evidence; do not infer approval from fixtures |
| Hosted developer local settlement | Base USDC, NGN/UGX recipient binding and provider quoting | Fee-policy parity, route-specific eligibility/allowance design and provider approval before onboarding |
| Bank-to-USDC onramp | Retained createPaycrestOnrampOrder implementation | Current payload lacks required source.kyc. Do not activate or document as ready |
| Collections/manual-address checkout | Deferred/inactive product boundary | Not an activation task; preserve existing records |

## Current provider/config snapshot

Read-only check at 2026-10-30T11:20:28Z:
- API key and webhook secret configured (values not recorded).
- Advanced daily allowance setting absent. Existing code fallback is NGN 50,000 equivalent; not a newly adopted or provider-approved limit.
- USDT payout enabled; source restricts direct USDT to Nigeria.
- NGN and UGX: 0.499999 USDC quote unavailable (404); 0.5 and 1 USDC available (200).
- Snapshot rates: 1364.15 NGN/USDC; 4079.3 UGX/USDC. These change; neither is a permanent minimum or delivered settlement proof.
- Institutions: 174 NGN banks, 2 UGX mobile-money providers. Base USDT/NGN quote available.

## Engineering findings to resolve before developer bank launch

1. **Provider-created order recovery.** In api/paycrest-pos.ts, remote create precedes fee/address/amount validation and local persistence. If validation or persistence fails after remote success, retry can hit duplicate reference with no local order. Existing prior live evidence reproduced this. Recovery must locate and bind the original provider order to intent, currency, asset, recipient, refund address and exact quote; ambiguous or funded orders must not be replaced. Do not solve by generating a fresh key or bypassing fee validation.
2. **Hosted local fee parity.** The explicit xpaySenderFee payload and assertXPaySenderFee validation apply to bank-withdraw or unifiedXPay. prepareDeveloperNairaCheckout passes source hosted-checkout without unifiedXPay; that branch uses PAYCREST_SENDER_FEE_PERCENT if configured and does not explicitly set transactionFeePayer. Paycrest documents sender as default, so the Pocket/XPay customer-cost model is not guaranteed on hosted local settlement. Implement a dedicated verified hosted policy before enabling it; do not silently change treasury destinations.
3. **Onramp provider contract mismatch.** createPaycrestOnrampOrder builds source.type fiat with refundAccount but no source.kyc. Paycrest now requires actual customer KYC and own-account funding. Recipient/link-owner identity cannot substitute for payer identity. Existing legacy handlers remain present; absence from docs is not proof of server-level disablement. Preserve the inactive rail boundary and audit server exposure before any deliberate rollout.
4. **Eligibility/control coverage.** Pocket daily allowance is owner/intent-bound with NG/UG shared usage and Lagos-day reset. XPay checks reserve that allowance. Hosted checkout separately enforces a project-level 24-hour USDC capacity (covered by hosted-checkouts-adapter-smoke). Hosted local settlement does not call that Pocket allowance helper; define and enforce the appropriate merchant/payer controls rather than assuming Pocket limits cover developers. A provider liquidity probe is not a customer allowance. No weekly/rolling velocity claim established.

## Checks rerun

Passed:
- paycrest-provider-boundaries-smoke
- paycrest-fee-payer-smoke
- paycrest-order-state-smoke
- paycrest-reconcile-policy-smoke
- pocket-kyc-transfer-limits-smoke
- pocket-kyc-bank-boundary-smoke (real component, headless Chrome)
- pocket-bank-uganda-payout-smoke
- pocket-bank-withdraw-adapter-smoke
- pocket-bank-receipt-refresh-smoke
- developer-local-settlement-smoke

Harness corrections: the allowance CJS fixture must run with plain node, not the tsx hook; the browser harness needed PLAYWRIGHT_MODULE pointing to the installed Playwright package. Both were rerun successfully. These were test setup failures, not product fixes. No funded settlement or refund was performed.

## Evidence/decisions needed

- Written Paycrest arrangement covering the actual off-ramp countries, assets, business model and responsibilities; separately confirm onramp approval if pursued.
- Bridge RFI submission/response, signed legal opinion where required, appointed compliance owner, adopted AML policy. Earlier flow-of-funds/lawyer briefing artifacts are drafts, not approvals.
- Route-by-route screening, sanctions/PEP, monitoring, case review, escalation, retention and reporting ownership; no claim these are complete from merchant KYB.
- Approved eligibility and limit matrix: user/merchant identity, daily and rolling/velocity controls, cross-country aggregation, hold/release/refund treatment, exception authority. Keep existing limit unchanged until decided.
- User confirmation of earlier successful bank payout: recipient delivery and reopened final receipt. Prior user statement �all verified and worked� is preserved as reported success; exact acceptance scope is awaiting clarification, not silently marked failed or independently verified.
- Suitable provider-supported refund scenario and evidence of actual return, separate from fixture state recovery.

## Sources checked this turn

- https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2 � exact funding amount and explicit customer transaction-fee payer.
- https://docs.paycrest.io/resources/changelog � October 2026 onramp customer KYC, payer matching, compliance holds/refunds, and optional paymentReference.

No new public bank onboarding documentation was published. No source or configuration changes were made from this checkpoint. Next engineering work is original-order recovery and hosted fee/control parity; provider/legal adoption remains an external evidence gate.

## Hosted fee correction

Implemented after the audit snapshot: hosted-checkout offramps now use the same explicit 0.25%, platform treasury and transactionFeePayer=customer payload as current Pocket/XPay, including returned-fee validation. This corrects finding 2 without enabling a route or raising a limit. Actual order-construction fixtures cover NGN and UGX hosted requests and reject a provider response that nets the platform fee away. Tests create no real orders. Deployment evidence follows.

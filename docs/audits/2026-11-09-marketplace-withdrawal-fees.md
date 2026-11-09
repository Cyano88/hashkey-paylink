# Marketplace withdrawal fee audit

Audited 2026-11-09 at f2616d05a on feat/marketplace-payments-foundation-20261109. Read-only implementation review and fixture verification; no financial implementation, deployment, provider order creation or transfer performed. Existing dist and unrelated work preserved.

## Conclusion

Merchant-paid payout costs are a reasonable proposed policy, but the existing wallet implementation does not implement it. Do not enable execution or describe fee receipts as complete. Financial Marketplace routes are not mounted in server.ts; marketplace-access is registration/review, and pocket/marketplace is a separate existing product.

## Findings

1. HIGH: Wallet reservations have one amount, used as both debit and recipient transfer. Execution explicitly requires feesCoveredOutsideAllocation=true and additionalTokenDebitUnits='0'. Reconciliation requires the full reserved amount to arrive. Deducting gas only in the transfer would fail reconciliation. Sources: api/marketplace/wallet-payouts.ts:10, wallet-execution.ts:9, wallet-custody.ts:45, wallet-reconciliation.ts:33.
2. HIGH: Accounting has pending/available/reserved/paid/refunded but no separate fee expense, fee liability or recovery lifecycle. Failed operations restore the full reservation. A broadcast transaction can incur gas even if it reverts; new reimbursement must distinguish cancellation without submission from verified spent gas, and never charge retries twice. Sources: api/marketplace/accounting.ts:27 and result handling; payout-cancellation.ts.
3. HIGH: Bank quotes include provider fees but no separate funding gas. debitUnits equals fundingUnits, and netUnits + feeUnits equals fundingUnits. The fresh Paycrest verifier identifies feeUnits as transactionFee and requires senderFee zero. The existing general createPaycrestOfframpOrder helper applies sender fees/merchant budgeting for other flows, so unchanged reuse risks a second processing fee. Sources: bank-quotes.ts:9-27; paycrest-quotes.ts:29-35; api/paycrest-pos.ts:400-433.
4. HIGH: Payer checkout fees are verified but not carried into the hosted-checkout receipt path. event-registry.ts:525 types the result with optional merchant fees and forwards only fees at line 544; payerFees are not forwarded. checkout-receipts.ts:31 maps merchant fees only. Thus the verified buyer principal/processing fee/gas/total breakdown needs durable receipt plumbing, including PDF and email, rather than a display-only approximation.
5. MEDIUM: No Marketplace withdrawal preview or payout receipt integration was found in the portal/receipt sources. Wallet instructions expose amountUnits only. Bank instructions expose debit/fee/NGN values but not a full quote presentation contract. Webhook payloads expose debit and recipient amounts without fee breakdown, quote identity, or exchange-rate details. Sources: instructions.ts:66-84; webhooks.ts:25; src/developer; src/lib/paymentReceiptPdf.ts.
6. HIGH: Refunds preserve the authorized original-payer principal, but no marketplace-funded refund gas reserve ledger exists in the reviewed Marketplace book. Execution delegates authorization to an adapter; that is not evidence of funded fee coverage. A reserve balance, funding provenance, atomic fee reservation and final cost reconciliation must precede that proposed policy. Sources: refunds.ts; refund-execution.ts:16-52; runtime.ts:105-120.

## Recommended build contract

- Keep checkout processing fee plus collection gas paid by buyer above allocation principal. Keep developer commission inside principal.
- First payout implementation stays Base USDC. Quote withdrawal gross debit, recipient net, network reimbursement, provider fee where relevant, fee payer, currencies, destination binding and expiry. NGN also includes rate and exact naira receipt. No second Hash PayLink processing commission.
- Reserve the complete accepted debit atomically. Track recipient settlement separately from fees retained/recovered; retained reimbursement must not become spendable seller funds or disappear from backing accounting. Bind consent to the exact quote and beneficiary. Never silently increase debit or decrease accepted net.
- Determine whether the disclosed network reimbursement is a fixed quoted charge or an actual-cost cap before implementation. They are different promises. For a simple pilot, a fixed, short-lived quote gives an exact recipient amount; Hash PayLink bears estimation differences within its risk limit. If exact actual-cost reimbursement is required, reserve a cap, credit unused reserve, and expose estimated versus final amounts explicitly.
- Base gas is not paid to validators in USDC. Verify the actual Circle sponsorship/billing mechanism and a bounded conversion into USDC reimbursement; no gas funding claim based only on the stablecoin holding balance.
- Refund approved principal intact. Marketplace fee reserve covers gas only after it is actually funded and atomically reserved. Original checkout fee refundability remains a separate policy.
- Persist one authoritative fee breakdown used by preview, API response, authenticated status, signed webhook, history, receipt, PDF and email. Quote acceptance may be programmatic under explicit developer authorization; an interactive confirmation is not mandatory for every automated payout.
- Standard amounts follow the established display convention. Preserve integer micro-units internally; do not hide a positive sub-cent fee as 0.00. Include coverage for 1.50000-style trailing zeros and tiny network charges.

## Verification

All 13 existing targeted scripts passed using node --import tsx scripts/marketplace-<name>-smoke.mjs:

wallet-payouts, wallet-execution, wallet-custody, wallet-reconciliation, bank-quotes, paycrest-quotes, bank-execution, bank-reconciliation, refund-execution, refunds, webhooks, payer-fees, accounting.

These cover isolation, atomic competing reservations, cancellation before submission, expired quote cancellation, unknown outcomes remaining reserved, restart/idempotency, no blind resend, exact finalized amounts, duplicate fee denial, partial refunds and webhook retries. They verify the existing external-gas-coverage model, not merchant-paid payout fees.

No live RPC/provider verification or production configuration refresh was performed in this audit. No new withdrawal UI exists to verify visually, so flicker, back/forward, stale quote cancellation, double-click submission, receipt rendering and mobile CTA checks remain required after implementation. No claim of production readiness.

## First implementation after owner instruction

Implemented locally after "next go": trusted, short-lived Base USDC wallet quotes; gross debit reservation with exact net recipient transfer; quote-bound execution deadline; success-only fixed fee accrual; cancelled/failed payout full restoration; fee-preserving ledger conservation and backing checks. Fee recovery is retained in holding and explicitly counted as an obligation, with no sweep implemented. External Circle gas coverage is still required; retained USDC is not assumed to pay native gas.

Added separate quoted wallet instruction methods for preview/acceptance, status fee disclosure, signed webhook fee breakdown and authenticated receipt retrieval. The existing unified receipt view/PDF renderer displays amount debited, network fee, amount received, destination and transaction. Amount formatting retains at least two decimals and preserves micro-unit fees. Legacy unquoted internal paths remain for existing fixtures/externally covered payouts; production activation must explicitly select the quoted path. No financial route was mounted.

The new marketplace-wallet-fees-smoke suite passed, including concurrent reservations, quote tampering/binding, missing trusted resolver, quote expiry, cancellation, restart, unknown-state protection, exact net transfer, one fee accrual/event, failure restoration, receipt row values, sub-cent formatting and retained-fee backing shortage. Eleven existing suites passed: accounting, wallet-payouts, wallet-execution, wallet-custody, wallet-reconciliation, backing, instructions, refund-execution, bank-reconciliation, webhooks and bank-receipt-presentation. Focused TypeScript passed for 17 changed/relevant files; whitespace checks passed.

Still outstanding: production quote issuance and verified Circle billing/gas estimation, fee recovery/sweep accounting, NGN funding-gas quote extension, refund fee reserve, buyer checkout fee receipt propagation, receipt email integration, and browser/mobile visual interaction checks. The receipt renderer is wired and value-tested, not visually certified. No deployment, live transaction or production-readiness claim.


## NGN network fee implementation

Added optional versioned fixed-success-only network reimbursement to bank quotes. New terms require an exact provider exchange rate and validate: gross debit = provider funding + retained network fee; provider funding = conversion principal + provider fee; the total of both fees stays within the accepted cap. Legacy provider-only reservations retain their previous representation. Fresh provider verification binds the exact accepted rate, including changes too small to affect NGN rounding, and still rejects a duplicate sender/platform fee.

Bank settlement accrues only the retained network reimbursement, with provider funding recorded separately from that retained balance. Fully returned failures require proof of the full provider funding amount, not the gross debit: the retained network fee never left holding and is restored with the returned funding. Partial returns remain unresolved. Funding reverts restore the full debit without charging a network reimbursement.

Added project-authorized final bank receipt retrieval and fee breakdowns in reservation responses, payment status, signed events and the unified receipt renderer. Bank account details are masked; receipts show debit, provider fee, network fee, exact NGN received and quoted exchange rate. Failed receipts show zero charged fees and zero delivered amount.

Verification: new bank-fees suite, bank-quotes, paycrest-quotes, bank-reconciliation, wallet-fees, bank-execution and webhooks passed. Focused TypeScript passed for 20 relevant files. These are synthetic provider/chain checks, not live payout evidence. Source changes remain local and financial routes remain unmounted.

Circle discovery: existing developer treasury client has transfer execution but no fee-estimation method. The existing user-controlled wallet contract estimator is not automatically a verified developer-SCA transfer estimator. Official Circle Gas Station billing describes developer billing for sponsored gas plus provider charges (https://help.circle.com/support/en/developer-services-product-fee-schedule?id=kb_article_view&sysparm_article=KB0010546). This verifies the billing model, not this account's sponsorship readiness. No account configuration, live estimate, funding or order creation was performed. Production quote issuance remains gated pending verified estimator schema and account coverage; do not invent a fixed gas price.


## Buyer checkout fee receipt propagation

Connected the verified payer-fee result from event registration to the stored hosted payment. New payer-paid checkouts cannot become paid without fee evidence; persisted arithmetic is validated, non-Base-USDC/incompatible routes reject it, and retries cannot replace recorded fee terms. Historical receipt display validates stored amounts rather than applying today's processing rate. The order principal remains unchanged for allocation accounting. A payer-paid record missing its fee evidence cannot produce a misleading principal-only receipt.

The common receipt view, billing email (plain text and HTML), and server PDF now show order amount, processing fee, collection network fee and total paid. Tiny fees retain exact micro-unit display. No email was sent. Added marketplace-checkout-fee-receipts-smoke with a 100 + 0.25 + 0.01 = 100.26 fixture, missing/tampered evidence and replay checks, principal preservation, fee rows, email content and PDF generation. Existing checkout-receipt-rails, checkout-receipt-pdf, hosted-checkouts-adapter, marketplace-checkout-creation and marketplace-payer-fees passed. Focused TypeScript passed for 26 relevant files before the final missing-evidence receipt guard; final checks rerun afterward. Visual/mobile receipt certification is still outstanding. Changes remain local, with no deployment or financial activation.


## Release audit and deployment boundary

Final software additions: Circle developer-controlled Base transfer estimate adapter (no signing), capped fresh ETH/USDC gas quote calculation with an explicit provider surcharge policy, and refund-fee reserves funded only through an authenticated instruction against released platform commission. Reserve credits are idempotent, preserve allocation conservation, and remain in holding backing obligations. Refund submission atomically reserves gas with the unknown execution claim; verified success accrues the fixed fee, verified failure restores it. Unknown outcomes stay reserved. Production refund runtime cannot construct without a quote adapter. No generic accounting instruction can bypass reserve funding. Refund verification also rejects extra holding outflows.

Live read-only preflight on 2026-11-09T22:38:17Z verified the configured Circle holding identity, then the official estimate endpoint returned HTTP 400 / provider code 155208, "Estimate fee execution reverted." No transfer was created. This is an unresolved funded-simulation blocker, not a successful live gas quote. Gas Station coverage and funded end-to-end execution must still be verified before financial activation. Existing account configuration remains unchanged, with no project allowlist and workers off.

The earlier production deployment was 3ba6510839366c53231669fafd02e787bde07dbe. Deployment targets only the reviewed new Git commit. No retired escrow endpoint is mounted; no scheduler or financial feature flag is enabled by this release.

Verification: the 35-suite Marketplace/checkout/treasury regression run passed before final review changes; the final rerun also passed all 35 suites. Focused TypeScript passed for 31 files. Production source build succeeded in an isolated output directory; existing large-chunk and dependency annotation warnings remain. Checkout receipt browser checks passed at 320/390/1280 widths in both themes, copy/PDF/back and status transitions. Wallet and NGN receipt mobile screenshots were inspected using the real shared component, and Done/reopen navigation was exercised. Screenshots: output/playwright/marketplace-fee-receipt-390-light.png, marketplace-wallet-fee-mobile.png, marketplace-bank-fee-mobile.png. The test harness is local; it is not a fabricated live merchant payment.

Known activation limitations: live funded simulation and sponsorship are unverified; new quote APIs and reserve instructions remain internal/unmounted. Initial operational reserve must be funded from eligible marketplace commission (there is no arbitrary external top-up credit endpoint). Accrued reimbursements are retained and backed, not automatically swept. This release deploys fee accounting, safeguards, disclosures and documentation; it does not open the Marketplace financial pilot.

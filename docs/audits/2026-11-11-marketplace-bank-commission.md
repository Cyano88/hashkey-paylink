# Marketplace withdrawal commission correction - 2026-11-11

## Owner decision

The owner explicitly retained the existing 0.3% bank withdrawal commission. The earlier zero-commission requirement was an incorrect interpretation and is superseded. Do not remove the shared Paycrest profile commission or open a separate zero-fee profile for this purpose. Historical failed quote records remain immutable.

## Implementation

The initial correction requested senderFeePercent 0.3 with customer-paid provider transaction fees. The exact-fee continuation below supersedes that request format while retaining the same 0.3% policy. New quotes persist commissionUnits and commissionRateBps (30), include commission in funding, total debit, maximum fees and minimum/shortfall calculation, and reject any other provider rate or amount. Integer calculations use six-decimal USDC units. Accepted terms remain immutable during quote replay, pre-funding verification and final bank settlement. Older persisted zero-commission quotes retain their original terms.

feeUnits remains the total paid to the provider above principal (commission plus provider transaction fee), preserving accounting conservation. API disclosure, webhook fees, bank receipts, receipt emails and PDF details separate commission from provider fee and network reimbursement. Definitive failed/full-return outcomes disclose zero charged fees; unknown outcomes retain reservations. The UI and developer docs state the retained commission and fresh-quote requirement.

## Live quote evidence

A single new unfunded provider order was created through the existing authenticated internal quote-only pilot for the registered seller and bank ending 9696. Paycrest returned amount 1 USDC, senderFee 0.003, senderFeePercent 0.3, transactionFee 0.02, and rate 1380.61. Network estimate was 0.004148 USDC. The service correctly returned MARKETPLACE_BANK_FEE_SHORTFALL, estimating 1.027148 USDC required and 0.027148 USDC shortfall. These are historical estimates, not an accepted executable quote.

Before/after live ledger checks confirmed exactly 1 USDC available, no reservations or payout operations. No funds moved, no signing worker was enabled, and the shared Paycrest profile was unchanged. The configuration blocker is resolved in the request/verification path; live funded bank settlement remains unproven and still needs sufficient seller funds and a fresh accepted quote.

## Validation and release

Focused quote, transport, policy, provider-refresh, settlement/custody, receipt and restoration checks passed. The 50-suite Marketplace run found two failures: receipt projection missing the new commission row (fixed and custody rerun passed), and a stale beneficiary error-text assertion (corrected and rerun passed). All other 48 suites passed. The added integer-commission suite passed, including micro-unit rounding and changed/malformed percentage rejection. Focused TypeScript checks passed after the fixes. Portal browser checks passed at 320, 390 and 1280 pixels in light/dark; the mobile screenshot was reviewed. These tests use fixtures and do not establish real bank arrival.

Deployment verification and remaining developer portal work are recorded in the continuation below.

Production Vite build verified with direct process exit code 0. Developer product-picker browser and project API adapter suites passed (Marketplace-only selection, access gating, owner scope and configuration persistence). No new end-to-end onboarding assertion is claimed from those component/API checks.

## Deployed verification and portal continuation

Render deploy dep-dbq1khp5efls739d6vc0 is live at source commit 14523bca6f750c161ddecc4b96acd423c2d7c968. The live developer page returned HTTP 200, served the 0.3% withdrawal-commission wording and recent-quote UI, and rejected unauthenticated balance access with HTTP 401. Production bank payout and worker flags remain false. No provider-profile settings or production activation switches were changed.

Developer portal continuation: the full fresh-onboarding browser suite passed with the real project handler and fixture storage/authentication, covering personal/business setup, sandbox default and persistence, profile isolation and production app-type inheritance. Full console checks passed for draft creation, activation payload, grouped developer tools, unsaved-webhook protection, navigation and mobile/dark layouts. Receipt-settings save/round-trip checks passed at 320/390/1280; the mobile onboarding screenshot was reviewed. These establish tested UI/API behavior, not live OTP, KYC, webhook delivery or funded settlement acceptance.

Outstanding financial acceptance: seller has only 1 USDC. A fresh quote and enough released balance for the 1 USDC net minimum plus commission/provider/gas fees are required before the bank canary. A 0.05 USDC additional checkout was offered, not created or paid. Do not treat the historical 0.027148 USDC shortfall estimate as a current executable quote. Further public Marketplace activation still requires the recorded operational/live acceptance criteria; the code correction does not itself authorize unattended rollout.


## Exact-fee continuation (2026-11-11)

The released 0.05 USDC top-up increased the internal seller's available balance to 1.05 USDC. The earlier insufficient-balance note above is historical. Existing Circle sponsorship was verified against the configured holding SCA and a finalized successful sponsored UserOperation; no Circle dashboard policy was changed.

Live percentage-mode order 45f4661b-0bc2-47e4-9e52-d4782cf70acc returned senderFee 0.0032 on amount 1.05 at 0.3%, while our micro-USDC calculation is 0.00315. Validation stopped before reservation/funding. Paycrest's official v2 schema documents mutually exclusive senderFee (exact crypto units) and senderFeePercent fields: https://github.com/paycrest/docs/blob/main/openapi-v2.yaml . No undocumented rounding rule was assumed.

A single unfunded exact-fee probe (dd4b5cf1-1367-4387-8750-3ec021c5dcf1) accepted 0.00315 on 1.05; independent GET readback preserved that amount. Create returned an empty percentage, while GET returned 0.3. Further unfunded quote orders showed GET percentages derived from micro-unit amounts (for example 0.30000586521731). The authoritative policy is therefore our integer 30-bps calculation plus the exact returned fee, not the provider's derived percentage metadata.

New orders send only senderFee, calculated half-up at USDC precision. Persisted commissionMode fixed_units scopes this interpretation to new quotes; historical percentage and zero-commission quotes retain their original checks. Quote refresh and final settlement both require the exact accepted amount. Fees, debit, receipt disclosure and 30-bps policy remain unchanged. Shared provider profile defaults are untouched.

The next unfunded attempt exposed gas-estimate variation during budget convergence. Bank quotes now retain the largest bounded estimate across attempts, matching wallet quotes, and correct the integer inverse before creating another order. Final preflight still re-estimates actual funding gas and rejects insufficient coverage. Trial orders remain unfunded and failed operation IDs cannot be retried into new orders.

Validation: commission, request transport, quote construction, provider refresh, quote reservation, custody/settlement, reconciliation and bank-fee suites passed. New regressions cover exact 1.05 total debit, 0.00315 versus 0.0032 fee mismatch, derived percentage metadata, historical validation, invalid mode rejection, final settlement, and falling gas estimates. Focused Marketplace TypeScript diagnostics passed (42 files). This backend-only change does not require rebuilding the installed Pocket APK. Live quote and deployment results follow separately; fixture passes are not bank settlement proof.


Fresh live quote 802442bb-9c70-4964-909b-430fff5b8869 (operation internal_bank_acceptance_20261111_03) passed full provider readback and exact budget validation: debit 1.05 USDC, conversion 1.022883, commission 0.003069, provider fee 0.02, network fee 0.004048, funding 1.045952, rate 1390.82, payout NGN 1422.65, verified bank ending 9696. Two finalized payment sources remain unchanged, with no reservations or operations. No payout has been submitted. Quote expiry is provider-controlled; revalidate before any funding and never reuse an expired quote.


## 14 November resumption

Render deploy dep-dbq9ea8m7kps738q1ts0 is confirmed live at source 7733a5b7be9049f134fc3d218e53a82f2b4a3305 (live since 11 November 16:33:21 UTC). On resumption both payment sources retained 1.05 USDC available, zero reservations and no execution attempts. The old quote and sponsorship approval window had expired. The configured holding SCA and finalized sponsorship proof were reverified, and the internal project-only coverage record renewed for one hour without changing Circle policy or production worker flags.

A fresh quote c89f44e0-3abf-48cf-ade6-312b52d97b83 accepted debit 1.05 USDC, conversion 1.023358, 0.003070 commission, 0.020000 provider fee, 0.003572 network fee and NGN 1433.39 to the verified bank ending 9696. Direct diagnostic samples showed fluctuating HIGH-tier gas estimates; independent later samples were 0.003543 and 0.003535 USDC, below the quote. A local reservation then passed its preliminary checks, but the final five-second preflight freshness check rejected before submission. No signing call or Circle transfer binding was created.

The same deployed code was tested beside the database using isolated Render jobs. This avoided altering the five-second check or granting SSH access. The hosted attempt reached the gas guard in approximately 0.6 seconds, then rejected an estimate above the locked quote. Three bounded unsigned preflight checks also rejected gas coverage; no signed transfer was retried. Normal authenticated cancellation cancelled operation internal_bank_acceptance_20261114_01 and restored exactly 1.05 USDC available, zero reserved. Production bank payout/worker flags stayed false throughout.

A final bounded hosted test creates and executes a new quote in one process to avoid local-to-hosted delay. It is scoped to the same two sources, seller, verified bank and 1.05 USDC maximum debit, rechecks current credential authority, and uses normal quote/reservation/custody functions. Any unsigned failure is cancelled through the normal cancellation guard; ambiguous/submitted attempts cannot be cancelled or blindly retried. Record its actual result below before claiming bank settlement.

Portal readback on 14 November confirms Lunchroom remains active with NGN settlement, its existing webhook URL/receiver secret, one active key and seven accepted historical webhook events. This is configuration verification, not fresh NGN settlement acceptance.


The fresh hosted test (operation internal_bank_acceptance_20261114_02, quote 4e6d3f6b-6320-4aae-8a7b-6c6a74e37ab5) passed quote/gas preflight but exposed an actual persistence bug: BankExecution compared serialized quote objects, so PostgreSQL JSONB key ordering falsely triggered "Accepted payout changed during preflight." Read-only inspection proved isDeepStrictEqual(stored, validated) true, JSON.stringify equality false, and zero changed value fields. The attempt remained unsigned, and the job's normal cancellation restored its funds.

BankExecution now uses structural deep equality for refreshed and transaction-locked quotes. Every value remains checked, including array/source order; only object key insertion order is ignored. The execution regression now reorders all persisted object keys to mimic JSONB. It failed before the correction and passes afterward, including a real maximum-fee change injected during preflight that still rejects. Custody and accumulated-source/receipt suites also passed. No freshness, sponsorship, fee or authorization guard was weakened.


Source 05980c393d69a1c3e8accf149a801161da7018c2 is confirmed live in deploy dep-dbscvmbl550s7384alc0 at 14 November 21:22:25 UTC. The fresh hosted quote/submission test on that exact build (operation internal_bank_acceptance_20261114_03, quote 4bc4d90e-10ba-4738-a9a8-46608f2abaa7) again stopped at the gas-price guard before signing. The normal cancellation path restored its reservation. There is no funded bank-settlement acceptance yet, and no bank receipt/event was fabricated from these cancelled tests.

Outstanding product decision: the fixed seller fee currently must cover every refreshed gas estimate. Even a small increase blocks execution despite external sponsorship and the separately approved 0.01 USDC maximum gas envelope. The owner has been asked whether to keep mandatory requoting or allow Hash PayLink to absorb a difference within that cap while holding the accepted seller debit fixed. No such economics change has been implemented, no cap raised, and Circle policy is unchanged. Do not keep creating canary orders until this choice is resolved.

Final live safety read at 2026-11-14T21:27:26.472Z verified the two test sources have 1.05 USDC available, zero reserved and zero paid. Every bank attempt is expired/unsigned with no Circle transfer binding, transaction hash or submission marker. Public payout and worker flags remain false.


## Owner-approved gas pricing policy (14 November)

The owner approved bounded gas absorption after reviewing fee responsibility and seller consent. Accepted seller debit, NGN payout and receipt charges stay fixed. Hash PayLink can absorb an estimated gas increase while total gas stays at or below 0.01 USDC. If a seller has explicitly accepted a higher network fee in a replacement quote, that accepted amount may cover a higher cost; it does not raise the platform absorption allowance. A further increase above both limits requires another approved quote. The 0.3% commission is unchanged.

Current sponsorship evidence and the configured operational maximum remain mandatory and independent. The new policy never raises Circle limits or operator-approved coverage automatically. A higher replacement quote is executable only within those independently configured limits. Already-submitted/ambiguous transfers are reconciled, never repriced, cancelled or blindly resent.

Implementation records the quoted fee, refreshed estimate, estimated platform absorption, coverage reference and zero additional seller debit on the execution attempt before signing. These are estimates, not claims of final provider billing. Seller receipts continue to use immutable accepted charges. Changed Paycrest fees or exchange rate require a fresh quote. Before submission, that explicit quote-refresh error invokes the existing cancellation guard to restore source balances; authenticated payment status exposes quoteRequired/approvalRequired. The cancellation guard refuses any attempt with submission evidence.

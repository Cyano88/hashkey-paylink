# Marketplace withdrawal commission correction - 2026-11-11

## Owner decision

The owner explicitly retained the existing 0.3% bank withdrawal commission. The earlier zero-commission requirement was an incorrect interpretation and is superseded. Do not remove the shared Paycrest profile commission or open a separate zero-fee profile for this purpose. Historical failed quote records remain immutable.

## Implementation

New Marketplace orders explicitly request senderFeePercent 0.3 with customer-paid provider transaction fees. New quotes persist commissionUnits and commissionRateBps (30), include commission in funding, total debit, maximum fees and minimum/shortfall calculation, and reject any other provider rate or amount. Integer calculations use six-decimal USDC units. Accepted terms remain immutable during quote replay, pre-funding verification and final bank settlement. Older persisted zero-commission quotes retain their original terms.

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

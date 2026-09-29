# Pocket verification tiers - 2026-09-29

Basic uses the existing Smile V3 / hosted web v12 production BVN and selfie flow. Basic grants a shared NGN 50,000 daily allowance for bank transfers and XPay bank payouts. Advanced requires the existing identity-matched NIN or government-ID step after Basic. Sandbox and pending results never grant live eligibility.

The Advanced amount remains a product decision. Set POCKET_ADVANCED_DAILY_LIMIT_NGN to an integer greater than 50000 only after that decision. Missing/invalid configuration retains the Basic cap, never unlimited. UI states higher limits are pending activation.

Bills retain their existing product limits and do not consume the bank allowance. Crypto-only XPay and wallet transfers are not bank payouts. Uganda bank/mobile-money payouts consume a server-priced NGN equivalent. The day resets at 00:00 Africa/Lagos.

Quotes check capacity without reserving it. Bank authorization and XPay's approved conversion/payment stages reserve through a Postgres row-locked ledger. Retry bindings prevent amount changes or duplicate consumption. Only durable provider-confirmed refunds or unfunded terminal failures/cancellations release reservations; expiry alone is insufficient proof. Uncertain authorizations remain held pending reconciliation or the next daily reset. The ledger begins with this release; historical payments are not backfilled.

KYC result handling retains signed callback verification, provider result retrieval, identity matching, and sandbox isolation. No ID number or selfie is added to the allowance ledger. No live identity or payment was submitted during implementation.

Validation: transfer-limit concurrency/idempotency/currency/day-boundary tests, bank authorization rejection, XPay ownership/recovery/payout binding, signed V3 callback tests, browser consent/pending/error recovery, bank-entry gate, and responsive 320/360/390/430px layout. Production token/config and hosted consent screen were reachable; user-completed production verification remains the final end-to-end test.

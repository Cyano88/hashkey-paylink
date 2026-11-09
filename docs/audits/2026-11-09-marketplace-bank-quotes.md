# Marketplace bank quote acceptance and reservation

Status: internal implementation, not deployed. Production Paycrest quote resolver and custody configuration remain absent.

## Changes

- Strict normalized quote contract for Base USDC to NGN with exact token, amount, fee, destination, holding and expiry bindings. The trusted adapter must source these facts from persisted preparation and actual provider records; shape validation is not provider verification.
- Atomic quote/reservation persistence, duplicate provider order/intent/quote rejection, active beneficiary recheck and expiry recheck under the store mutation.
- Retry retrieves original quote/current operation without reserving again or resolving a replacement. Changed quote/authorization under the same key is rejected. Unknown outcomes retain funds.
- Separate marketplace:payout instruction scope and strict quote-ID-only request. Caller cannot choose project, debit, destination or result. Responses omit provider/holding identities, evidence and internal authorization.
- Generic bank reservation on a bound payment is rejected; it must use the accepted-quote path.

## Verification

Five fixture suites passed: bank quotes, bank beneficiaries/preparation, wallet beneficiaries, accounting, and instructions. Quote tests cover invalid asset/token/currency/debit/fees/NGN, zero addresses, non-finite timestamps, expiry before and during mutation, wrong project/payment/destination, absent resolver, competing requests, provider order reuse, revocation, restart and expired retries, unknown results, scope revocation and response redaction. Focused TypeScript diagnostics passed for nine marketplace files.

Tests use synthetic provider facts and serialized in-memory persistence. No production DB concurrency, real Paycrest order, live bank verification, on-chain funding, signing, payout, UI change or deployment is claimed.

## Remaining

Implement and verify the production quote resolver against the actual provider-order creation path; do not repurpose an arbitrary existing Pocket order or source policy. Wire seller identity, custody choice/configuration, provider disbursement authorization, execution leases and recovery. Revalidate expiry, holding revision, beneficiary and provider status immediately before signing. A reservation must not be interpreted as a paid seller or as permission to broadcast after expiry.

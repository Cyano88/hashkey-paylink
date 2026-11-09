# Marketplace wallet beneficiary checkpoint

Status: internal, unmounted, not deployed. No real signatures, transfers or provider requests were made.

## Changes

- Base USDC/USDT EOA wallet-control challenge and signature verification, scoped to project, seller, asset and immutable destination version.
- Five-minute validity, unpredictable nonce, replacement invalidation and atomic one-time consumption. Raw signatures are not persisted.
- Atomic verified-wallet draft creation with matching seller/asset and immutable beneficiary snapshots.
- Permanent revocation for a version, blocking new bound payout reservations. New destinations require new version IDs and signatures. Existing snapshots remain historical records.
- Bank destinations fail closed in verified binding. Existing low-level unbound creation remains internal test infrastructure, not production authorization.

## Validation

Passed `marketplace-beneficiaries-smoke.mjs`, `marketplace-accounting-smoke.mjs` and `marketplace-instructions-smoke.mjs` through tsx. Beneficiary coverage includes wrong signer, changed signed seller, project isolation, expiry, challenge replacement/replay, competing verification requests, wrong seller/asset/route, restart persistence, immutable snapshots and revoked payout reservations. Tests use fixed disposable fixture keys and a serialized in-memory store, not production PostgreSQL.

Focused TypeScript diagnostics passed for six marketplace files. No UI changed, so browser tests were not repeated. No full build or live payment result is claimed.

## Remaining boundaries

Seller authority and identity verification must be wired before exposing registration. EOA verification is not an ERC-1271 smart-wallet verifier. Bank ownership verification and encrypted bank routing details remain open. Actual custody, collection, payout signing, finality, Paycrest execution and original-payer refund adapters are not enabled. A future worker must revalidate destination eligibility immediately before signing; revocation cannot undo an already submitted payment.

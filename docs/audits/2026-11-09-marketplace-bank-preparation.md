# Marketplace bank binding and preparation

Status: internal implementation, not deployed or exposed as a public API.

## Implemented

- Bank verification adapter reuses the Paycrest account-name lookup and requires a separately configured trusted seller-ownership verifier. Missing/mismatched ownership evidence fails closed. Production ownership verification remains unwired.
- Dedicated AES-256-GCM encryption, authenticated project/seller/version context, keyed destination digest and key-version checks. Account numbers and names are not stored as plaintext. Registration returns only masked routing metadata.
- Immutable bank versions share the beneficiary namespace with wallets. General verified-beneficiary draft creation snapshots matching active bank/wallet destinations atomically. Revocation blocks new bound reservations.
- Read-only bank payout preparation validates released Base USDC, an eligible snapshot/current destination pair, NGN precision, total debit, fee ceiling and nonzero refund address. It returns sensitive internal provider-request material, not a developer response or executable transaction.

## Validation

Passed the bank, wallet beneficiary, accounting and instruction smoke suites with synthetic keys/accounts/evidence and an in-memory serialized repository. Focused TypeScript diagnostics passed for eight marketplace files. No provider calls, real bank verification, production database tests, signatures, payouts, deployment or UI changes occurred.

Bank tests cover absent/mismatched ownership evidence, provider name failure, invalid account format, encrypted-record tampering and context substitution, masked responses, version collisions, cross-project reads/creation, unreleased/insufficient funds, invalid NGN precision, excessive fee budgets, no mutation during preparation and revoked reservations. Existing marketplace suites remain passing.

## Outstanding

Production seller identity/authority, ownership-verifier integration, encryption-key provisioning/rotation, holding configuration, provider approval for marketplace disbursements, actual quote creation/binding, reservation/execution leases, signing and reconciliation remain required. A preparatory fee ceiling is not an accepted provider quote. No payout is marked paid by this implementation. USDT bank settlement remains unsupported.

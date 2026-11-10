# Marketplace seller identity checkpoint — 2026-11-10

## Implemented locally

- Hosted `/marketplace/verify` page outside developer onboarding, using existing Privy login and Pocket Basic verification UI.
- Explicit seller consent, app/seller-scoped identity link, immutable owner binding, one-hour hashed bearer sessions, saved HTTPS return origins and current project/key authorization.
- Current production Pocket Basic/Advanced results are reused. Nigerian bank eligibility requires a verified legal name and reference. A developer's verification never substitutes for a seller's.
- Bank account resolution uses the existing Paycrest verifier; full normalized name must match the linked seller. Dedicated AES-GCM encryption key; only masked account details and beneficiary references are returned to the developer.
- Same-bank registration retry is idempotent; changed or revoked beneficiary versions remain rejected. Bank submission UI locks duplicate clicks and ignores stale account responses.
- Phone handoff preserves the claimed seller session in the URL fragment. It still requires sign-in to the linked account. Query strings never contain the session token.
- Developer endpoints: POST `/api/marketplace/v1/seller-sessions` and GET `/api/marketplace/v1/sellers/:sellerId/verification`. Existing Marketplace access gates apply. Session creation requires `marketplace:create`; status requires `marketplace:read`.
- Simplified integration docs and dedicated bank-encryption configuration names in `.env.example`.

## Validation

- 42 Marketplace non-browser regression suites passed, including identity consent, takeover rejection, expiry, current KYC/authorization, bank matching and masked status.
- Focused TypeScript diagnostics: 33 files passed.
- Vite production build passed into `.codex-temp/marketplace-seller-build`; existing dependency annotation/chunk-size warnings remain.
- Hosted seller browser fixtures passed at 320/390/1280 in light/dark: consent, verified skip, unverified Basic fallback, retry, double submit, return link, no overflow. Phone handoff link preserves fragment token. Auth, KYC and provider responses mocked.
- Marketplace docs browser tests passed at the same six viewport/theme combinations.

## Outstanding before bank settlement activation

This checkpoint does not activate bank payouts or demonstrate a live seller KYC/bank outcome. Dedicated `MARKETPLACE_BANK_ENCRYPTION_KEY` has not been configured in production by this task. Do not rotate it after records exist without a migration.

The public withdrawal quote service still rejects bank destinations. Remaining work: provider order creation/quotes with zero extra sender commission, Circle funding execution with crash recovery, current identity/bank verification at submission, live provider and on-chain reconciliation, and the gated bank worker. Reuse the existing bank quote, execution and reconciliation validation modules and accumulated-allocation accounting.

No live transfer, bank provider order or production deployment was performed for this checkpoint. Bank minimum remains 1 USDC net converted; wallet minimum remains 0.50 USDC net, with fees additional. Purchase and refund amounts are not restricted by these withdrawal minima.

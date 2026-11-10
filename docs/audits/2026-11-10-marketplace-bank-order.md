# Bank-only Marketplace order creation - 2026-11-10

Live preflight confirmed the internal seller has a verified active bank beneficiary but no funded order for that seller. The only earlier pilot book was 0.1 USDC under different allocation references. Bank payouts and worker remain off.

Found and fixed an API integration gap: createPayment forced every allocation to wallet_usdc. It now accepts optional settlement cash_balance or wallet_usdc, defaults to wallet_usdc for existing clients, and binds bank allocations using the existing verified-beneficiary repository path. Wallet-only calls retain the original idempotency hash path. Bank binding still requires the same project, seller, Base USDC asset and active status. No caller can submit bank details or ownership evidence during order creation.

Tests cover bank-only and mixed bank/wallet drafts, replay, existing wallet request compatibility, invalid routes, mismatched/missing/revoked banks, encrypted beneficiary validation and accumulated bank payout accounting. Fixtures do not establish real provider settlement.

Owner explicitly selected a 1 USDC test order. This is collection/accumulation testing: a bank payout needs at least 1 USDC net plus fees. Do not weaken the minimum or spend unrelated holding funds to complete this test. Checkout fees remain additional and visible before payment.

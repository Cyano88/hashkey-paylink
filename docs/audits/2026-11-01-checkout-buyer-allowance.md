# Local-settlement checkout buyer allowance

Owner decision: reuse Basic identity verification for hosted merchant checkout,
with one daily allowance per buyer across all merchants. Pocket withdrawal
allowances remain separate.

The daily allowance uses the same current Base USDC/NGN capacity probe displayed
in Pocket's Bank payout card. This is Hash PayLink's checkout policy, not a
statement that Paycrest sets a daily KYC limit. Capacity is cached for five
minutes, fails closed when unavailable, and is never hardcoded to 6,992 USDC.
UGX payments also check the current UGX corridor capacity.

Amounts count the provider funding amount in USDC micro-units, including fees
in that funding amount. A buyer-level durable row lock protects concurrent
payments across merchants. Quotes only check allowance. Execution reserves it
before a Circle approval challenge is created. Repeated attempts for the same
immutable order count once. Only provider-confirmed refunds restore allowance;
cancelled dialogs and ambiguous failures retain reservations until daily reset.
Days reset at midnight Africa/Lagos. A retry on a later day is checked again.
Circle approval retries use an order-bound server idempotency key even if the
client sends a different key. The ledger starts tracking at release activation;
it does not retroactively import payments made before this policy existed.

Scope: hosted local-fiat settlement on the current Base USDC rail. Pure stablecoin
settlement, Pocket withdrawals, bills, legacy POS and separate XPay flows retain
their existing policies. No installed APK changes.

Validation: checkout-buyer-allowance-smoke, hosted-checkout-name-smoke,
checkout-preparation-error-smoke and checkout-verification-browser-smoke.
Fixture checks do not claim a funded high-value payment was performed.

# Marketplace bank withdrawal readiness - 2026-11-11

## Product behavior

Available funds are released ledger balances, not proof that bank withdrawal is enabled. The developer portal now shows bank route availability and up to 10 recent failed quote checks, scoped to the authenticated app and optional seller filter. Failed checks show historical fee information, not actionable payout quotes. No account numbers, provider order IDs, ciphertext or raw provider errors are exposed.

The quote API returns controlled errors:
- MARKETPLACE_BANK_COMMISSION_NOT_ZERO: provider profile commission must be corrected. A seller deposit does not resolve this configuration issue.
- MARKETPLACE_BANK_FEE_SHORTFALL: provider and network fees reduce net settlement below 1 USDC. Returns estimatedRequiredDebitUnits and estimatedShortfallUnits with estimateOnly=true. These use the failed attempt's fee estimates; a new accepted quote is required, because fees may change with amount/time.
- MARKETPLACE_BANK_CONFIGURATION_REQUIRED: gas or execution policy is not ready.

Structured rejections are durable. Reusing the same operation reference returns the recorded rejection without a new Paycrest order. Correct the cause and use a new quote operation reference. The rejected attempt never reserves or deducts ledger funds.

## Rollout gate

MARKETPLACE_BANK_FEE_POLICY_VERIFIED defaults to false. It is an operator rollout acknowledgement, not independent evidence of provider approval. Set it only after a fresh order from the intended Marketplace provider configuration returns zero sender commission and passes strict quote verification. Every quote and pre-funding check still verifies zero commission. This gate blocks new bank sends in fee preflight; already submitted transfers can still reconcile. Gas limits must also be explicit. Payout and worker switches remain off in production.

## Provider requirement

Paycrest rejected senderFeePercent="0" and senderFee="0" with HTTP 400. Omitting overrides returns the shared profile's 0.3% sender commission. Do not change the shared profile without assessing other checkout flows. Obtain either a supported per-order zero override or a dedicated zero-commission sender profile, and wire its credential consistently for creation, lookup, reconciliation and callbacks before enabling it. Do not point only order creation at a new key.

Suggested provider inquiry (prepared only; not sent):
"Our Marketplace payouts must have zero sender commission. V2 rejects both senderFeePercent: 0 and senderFee: 0; omitting them inherits our profile's 0.3%. What supported mechanism lets this product use zero sender commission without changing the shared profile used by other flows? If a separate sender profile/key is required, please confirm creation, order lookup and webhook configuration."

## Live evidence

The failed quote internal_bank_quote_20261111_04 was re-read by its saved provider order ID. Exact provider reference, amount, asset/network and fee values matched before annotating the failed request with seller-safe diagnostic metadata. No new order, reservation or transfer was created. Seller balance remained 1 USDC available. Historical provider fee is 0.02 USDC; even with zero commission, 1 USDC net needs provider fee plus gas above it.

## Validation

Readiness, quote error/replay/shortfall, owner-scoped projection, HTTP serialization and strict provider validation tests. Browser fixture checks cover mobile/desktop light/dark, availability notice and historical commission amounts; screenshot reviewed. Fixtures do not prove a funded bank payout. Remote deployment is tracked separately.

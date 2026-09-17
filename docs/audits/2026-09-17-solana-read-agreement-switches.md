# Solana read containment and Arc Agreement switches � 2026-09-17

## Implemented

- Solana balance and wallet activity now share a server-owned read transport. HTTP 429/5xx, network failures and JSON quota errors permit one fixed mainnet public fallback. The primary then cools down for 60 seconds. When the public provider also fails, reads back off for 15 seconds. Configuration/auth failures and ordinary RPC errors fail closed rather than silently switching providers.
- The transport accepts only getAccountInfo, getTokenAccountBalance, getSignaturesForAddress and getTransaction. It caps batches at 20, request bodies at 64 KiB, responses at 2 MiB, concurrent reads at eight, and upstream operations at 120/minute/process. A 20-item batch consumes 20 operations; fallback operations also count. No SDK 429 retries are allowed in these two readers.
- Activity cancellation propagates through fallback, and an empty signature list does not request an empty transaction batch. Activity failures now record a numeric error code without provider text or wallet/credential values.
- Signing, sendTransaction, bridge redemption and settlement verification continue using their existing paths. This transport is only for balance/history reads.

## Production checks and configuration

- Render SSH denied the available public key. No SSH access policy was changed.
- Retrieved the matching database's external connection using Render's documented connection-info endpoint, matched database identity to the service configuration, and queried in BEGIN READ ONLY / ROLLBACK with verified TLS.
- Mainnet counts at 17:33:48Z: activation attempts 0; reconciliation jobs 0; lifecycle jobs 0; operator actions 0; payer lifecycle actions 0 (store absent). No records, wallet identifiers or database credentials were printed.
- The reviewed mainnet Agreement release remains null. All five premature write/worker flags were changed from true to false and individually read back at 17:39:14Z. Configuration becomes effective on deployment: ARC_AGREEMENTS_ENABLED, ARC_AGREEMENT_PAYER_LIFECYCLE_ENABLED, ARC_AGREEMENT_RECONCILIATION_WORKER_ENABLED, ARC_AGREEMENT_LIFECYCLE_WORKER_ENABLED, ARC_AGREEMENT_OPERATOR_WORKER_ENABLED.
- Pocket recovery, money push and webhook workers were not disabled. No stores or provider keys were deleted.
- Alchemy app inspection confirmed its Solana IP allowlist contains both current Render outbound ranges. This does not establish remaining quota, network health or successful authenticated history queries.

## Validation

- solana-read-budget smoke passed: quota fallback/cooldown, JSON quota errors, configuration failure, blocked writes, batch budgeting, public outage backoff, abort, concurrency, response bounds, SDK fallback, empty history and exact balances above the JavaScript safe-integer range.
- Existing pocket-activity-rpc-budget, solana-balance-boundary, pocket-activity-adapter and arc-mainnet-boundary tests passed.
- Focused TypeScript check for changed backend modules passed.
- No real user transaction or authenticated history request was initiated. CU savings and provider recovery remain unproven.

## Evidence and references

Local sanitized evidence: output/detox-20260917/mainnet-job-counts.json, agreement-switch-correction.json and solana-provider-config-check.json.

Provider API contracts: https://api-docs.render.com/reference/retrieve-postgres-connection-info and https://api-docs.render.com/reference/update-env-var .

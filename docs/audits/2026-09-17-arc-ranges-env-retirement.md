# Arc scan reduction and environment retirement batch 1 — 2026-09-17

## Changes

- The current public Arc RPC accepted a wallet-indexed 120-block request in a bounded live probe. Public Arc wallet history now requests this range once per direction: two log requests instead of twenty-four for the same 120-block lookback. This is a request-count reduction, not a measured CU/billing reduction. Private-provider configurations retain ten-block chunks by default; the existing explicit block-range setting still overrides either default.
- EVM errors and activity logs now carry safe reason categories (quota, network, configuration or RPC), not raw provider text. Previous generic -32004 records could not establish the precise transport failure cause.
- Removed four direct Hash PayLink Render variables after verifying no application references: VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET, VITE_CIRCLE_SOLANA_EMAIL_ENABLED, CIRCLE_RECIPIENT_WALLET_KEY_PREFIX, AGENTIC_STREAMING_FROM_NAME.
- Removed the two obsolete Blueprint declarations and the obsolete testnet app-ID requirement from the StreamPay environment audit. A Windows CurrentUser DPAPI-encrypted rollback copy of the four values is retained locally under .codex-temp (never committed).
- Each deletion was verified with a 404 readback. No provider key was revoked, no user/payment data was removed, and no other service configuration was changed.

## Evidence and limits

- Public Arc ten-block current/older-range probes and the wider 120-block probe succeeded from the operator machine. A synthetic full scan through the production gateway failed on one of the first two small-range requests with -32004. This demonstrates an intermittent gateway/upstream failure, not proof of a specific rate limit or that history is unavailable everywhere.
- Public Solana getSignaturesForAddress succeeded from the operator machine. Earlier production logs confirm private Solana quota cooldowns. Shared public fallback capacity cannot be treated as production-grade capacity restoration.
- Solana's official guidance states public endpoints are rate-limited and not intended for production applications: https://solana.com/docs/references/clusters . No provider subscription, spend increase or credential change was made.
- Render Blueprint validation returned valid=true through the documented API; the CLI validation path failed local DNS resolution. Normal TLS verification remained enabled.
- Pocket activity budget tests passed for public Arc request reduction, private-provider defaults, explicit overrides, cache/isolation, cancellation and quotas. Existing EVM read, activity adapter, receipt policy and Solana read tests passed. Focused TypeScript validation passed.
- Sanitized evidence: output/detox-20260917/arc-wide-range-provider-probe.json, arc-full-scan-probe.json and environment-retirement-batch1.json.

## Remaining

Validate the release and observe the new failure categories. Continue reviewing the other retirement candidates individually. No claim that all unused infrastructure is gone or all history/provider failures are fixed.

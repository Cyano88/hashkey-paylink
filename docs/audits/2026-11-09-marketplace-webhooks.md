# Marketplace webhook delivery checkpoint

Status: implemented internal delivery engine, not deployed or scheduled. No webhook was sent during this work.

## Changes

- Explicit opt-in transport reuses existing developer webhook dispatch/signing and destination protections. Default repository has no sending transport.
- Project-scoped pending selection and atomic 60-second delivery lease with unique token. Stale-worker responses cannot overwrite a replacement attempt.
- Stable event ID, body and creation time across retries; current signing secret/timestamp per attempt.
- Matching-event HTTP 2xx acknowledgement required. Errors, skips and non-2xx responses back off, with eight attempts maximum and retained dead events.
- Timing/status-only delivery history; raw transport errors and secrets excluded. No payment state mutation.

## Validation

The webhook fixture suite passed signing-format checks, project isolation, concurrent claims, backoff, secret rotation, stale acknowledgements, restart after remote success/local commit loss, retry exhaustion and sensitive-data exclusion. Transport was injected; no network request occurred. Existing reconciliation, execution, quote, bank, wallet, accounting and instruction suites also passed. Focused TypeScript diagnostics passed for twelve marketplace files.

The signing assertion uses the actual shared request builder and independently recomputes the HMAC. Live HTTPS/DNS behavior and customer endpoint delivery were not retested; existing transport protections were inspected in source. No UI changed.

## Remaining

Wire the enabled scheduler only with product activation, verify production endpoint delivery, and add authorized operational recovery for dead events. Consumers must deduplicate and verify signatures: delivery is at least once, not exactly once. Payment custody/provider/signing and live validation gates remain unchanged.

# Pocket RPC cost audit - 1 October 2026

## Evidence

User dashboard: Base 78.5k, Arbitrum 74.4k, Polygon 38k, Solana 33.8k requests/24h. These are app totals, not per-user attribution or actual compute-unit costs.

The money-push worker starts with the server and runs every 30 seconds for registered push owners, even when their phones are closed. Wallet history shares a 30-second cache with foreground activity. Notification purchase context reads durable records, not a second wallet scan.

EVM scans previously fetched 120 blocks as 12 ranges with two directional log calls per range. At 2,880 scans/day, that is 69,120 log calls plus 2,880 block-head calls per wallet/network, before timestamp reads. This is consistent with the dashboard scale but is not direct attribution of all usage.

Solana history reads up to 20 transactions after every signature-list refresh, including repeatedly fetching the same finalized history. Balance reads already have EVM caching and in-flight sharing. Payment/recovery reads have separate responsibilities and were not disabled.

Live Render logs contained repeated Arc activity quota errors during 21:27-21:48 UTC on 1 October. The account's Alchemy invoice, per-method compute units and live environment overrides were not accessible through this audit; no claim of verified monetary savings.

## Changes

- Default activity log range 120 blocks: normally two directional queries rather than 24. Preserve previous history coverage, wallet filters, deduplication and refresh cadence.
- Recognize explicit provider block-range restrictions separately from quota errors. Retry ten-block ranges and remember that restriction for ten minutes. No public-provider fallback merely because a range is unsupported. Explicit range overrides still apply.
- Bounded, one-hour Solana cache for non-null transactions whose signature list reports finalized. Re-read confirmed, missing and expired entries. Only the activity reader uses it; settlement verification remains uncached by this feature.
- Aggregate five-minute upstream-attempt counters for the shared EVM/Solana read transports. Method/network counts only, no wallet identifiers, payloads, endpoints or credentials. These counters do not cover every independent SDK/provider path and are not billing compute units.

## Expected effect and limits

For a quiet EVM wallet with a provider supporting 120-block queries, base scan calls fall from 25 to 3 (88% fewer, excluding timestamp reads). Old Solana finalized history normally needs only the signature-list query after warm-up; new transactions still require detail reads. These are path-specific expectations, not a promised whole-account reduction.

Do not slow confirmation polling or remove deposit monitoring to reduce the bill. Compare post-deploy method counters and Alchemy hourly usage; the rolling 24-hour dashboard needs time to reflect the change. A ten-block environment override or provider restriction retains the higher log call count. Existing bounded lookback is preserved, not upgraded to a complete durable chain index in this patch.

## Validation

Targeted tests cover large-range acceptance, exact smaller-range coverage, restriction expiry, unchanged quota handling, finalized-only caching, null retry, endpoint isolation, TTL expiry and aggregate counter privacy. Existing RPC, activity, notification, balance and transaction-status regression suites were run. See delivery checkpoint for deployment outcome.

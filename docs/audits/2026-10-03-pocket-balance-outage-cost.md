# Pocket balance outage RPC reduction

Automatic XStocks balance reads now isolate OKX retry cooldowns per wallet. A failed wallet lookup no longer redirects healthy wallets to RPC for one minute. A bounded, in-memory cache retains each wallet's last complete RPC baseline across successful OKX reads. Subsequent fallback can scan transfers and reread changed holdings instead of discarding that baseline.

Incremental transfer queries use inclusive windows of at most 100 blocks, matching the X Layer endpoint limit. Existing canonical block checks, five-minute full rescans, stale-node checks and explicit forced-fresh reads remain unchanged. Transaction preflight and settlement verification are unchanged.

Validation: provider balance smoke tests, wallet outage smoke tests, balance cache/delta/reorg tests and focused TypeScript diagnostics passed. Tests cover isolated failures, provider recovery, retained baseline, cancellation, forced reads and pagination boundaries. These are conditional savings: first reads, expired baselines and explicit fresh verification still require full scans. No percentage cost reduction is claimed.

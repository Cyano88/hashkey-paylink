# Pocket Stablecoins audit — 30 September 2026

Scope: local-currency display, balance loading/cache, notifications, wallet sends,
Pocket ID sends, request payments, and bank transfer handoff/receipt state.

## Confirmed issues fixed

- Live FX responses waited for durable-cache I/O. Storage now runs outside the
  response path, and a late stored rate cannot overwrite a newer provider rate.
- FX refresh failures discarded still-valid quotes. Retain them only until their
  actual expiry. Clear old errors when retrying/changing currency so the loading
  shimmer can appear; expired/stale rates never render as live rates.
- Notifications waited for both request and notice feeds before painting either.
  Each feed now renders independently, with token-scoped cached data reused on
  reopening. Account changes still clear visible state.
- Pocket ID edits retained the previous resolved recipient during the debounce.
  Clear it immediately; Continue requires matching ID and network.
- Send displayed unavailable fresh balance reads as zero. Use the display snapshot
  for presentation and a shimmer while unresolved, retaining fresh balance checks
  for payment approval. Render the form without waiting for all network reads.

## Verification

Synthetic adapter/browser checks passed for balance caching, six-network snapshot
binding, quiet refresh/failure/reload, owner isolation, hidden-tab polling, FX
currency/expiry/retry handling and slow storage, independent notification feeds,
request acceptance/decline/payment route/cancellation, Pocket ID debounce, Send
approval/outcomes/deduplication, bank preparation errors, recipient lookup races,
bank handoff proof, status cache and receipt refresh. Changed-file type check passed.

Updated obsolete test assumptions: four-network fixtures, pre-release pull gesture,
old Send spinner label and a missing request-preparation mock export.

Public production quote probes before release returned valid NGN/UGX rates in
1.49/1.95 seconds; immediate cached repeats took 0.36/0.35 seconds. These are point-in-
time measurements, not a latency guarantee.

## Limits

No live money was sent and no PIN/OTP approval was performed. The audit validates
code paths and synthetic failures, not every provider outage or real settlement.
Confirmed bank handoff and final bank delivery remain distinct receipt facts.
The older all-in-one contract smoke suite has a separately known obsolete Polygon
wallet-link assertion; this report does not claim the entire repository suite passed.

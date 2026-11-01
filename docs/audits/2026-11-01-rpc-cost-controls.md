# RPC cost incident: 1 November 2026

## Evidence and scope

The reported Alchemy invoice is $48.97, payment failed. Live provider probes
returned HTTP 429. This release does not settle the invoice, change the plan,
set a spending cap, or claim that provider access has been restored.

The deployed backend uses Alchemy for canonical Base, BNB, Ethereum, Polygon,
Arbitrum, X Layer and Solana RPC. Circle/OKX display balance paths remain in
place, but BNB account and checkout display reads were still direct RPC.
Background server activity continues independently of a testing phone.

The scheduled X Layer fee-coverage audit ran every minute over a 28-day
history. The live read-only inventory contained 30 eligible hashed records:
one chain check plus receipt and block checks per record implies roughly
61 requests per run, or 87,840/day. This closely matches the reported 88,600
X Layer requests/day, but is an estimate, not invoice-level attribution.
The full-block X Layer notification scanner uses the public X Layer RPC;
its requests must not be presented as verified Alchemy billing.

The Base request total remains only partly attributed. Twelve old payout
execution intents had saved settled Paycrest orders and transaction hashes;
canonical receipt verification must still succeed before recovery is called
complete. No records were deleted or marked paid to suppress retries.

## Changes

- Background full billing audits run at most every 15 minutes after success.
  Errors remain errors and retry after 1, 2, 4, 8 and then 15 minutes.
  Concurrent invocations share one audit. Per-payment preflight remains fresh.
  This reduces the successful scheduled audit workload about 93.3%; it does
  not promise the same reduction in the total invoice.
- BNB account and checkout display balances share a wallet-scoped, bounded
  15-second cache backed by one signed OKX query for BNB, USDC and USDT.
  Responses validate chain, token, owner when supplied, precision and raw
  units. A bounded RPC fallback remains available. Total provider failure
  returns an error, never stale success or fabricated zero balances.
- Quotes, signing, submissions and settlement retain canonical balance and
  receipt checks; display cache values cannot authorize a payment.
- Unchanged execution records that fail reconciliation back off to at most
  15 minutes between attempts. Changed records retry immediately. Success
  is not cached as future payment proof. This applies to the reconciliation
  worker, including its admin trigger; direct payment recovery is unchanged.
- RPC telemetry now includes BNB runtime and X Layer billing attempts,
  aggregated by transport/network/method without keys, URLs or wallet data.

## Verification

Fixture checks cover audit cadence, shared requests, provider failure and
recovery, cache isolation, strict balances, unchanged failed execution
backoff, immediate retries after new evidence, BNB USDC/USDT checkout
authorization and settlement, X Layer canonical fee coverage, reconciliation,
activity RPC budgets and receipt email eligibility/idempotency.
One live read-only OKX query returned the three expected chain-56 token rows.
These checks do not constitute a funded settlement test.

## Remaining work

Measure post-deployment request windows and compare like-for-like periods.
Investigate the remaining Base volume using method-level evidence; do not
attribute every request to balance refresh. Resolve provider restrictions,
then verify outstanding receipt recovery and funded checkout end to end.
The broader checkout UI audit and pending unrelated frontend edits are not
included in this backend cost release. Keep the paused Zivah personal
developer KYC test for continuation after the incident work.

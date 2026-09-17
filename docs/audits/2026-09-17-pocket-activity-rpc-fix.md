# Pocket activity RPC containment — 2026-09-17

## Change

Pocket wallet history now uses the shared bounded EVM reader. Transfer queries include the linked wallet in the indexed sender or recipient field, with self-transfer deduplication. Scans preserve the prior bounded lookback, clamp configuration overrides, cap accumulated logs at 2,000, and limit timestamp reads to batches of four.

The activity-only cache isolates owner, network and wallet, retains at most 256 entries / 100 rows each, shares concurrent scans, serves successful results for 30 seconds, and can retain previously confirmed rows for up to two minutes during provider failures. Failure retries wait 15 seconds; capacity/quota failures back off the network for 60 seconds. At most 16 scans may run, and at most 60 may start per process per minute. EVM requests additionally use the existing 300 upstream-attempts/minute service budget.

A recent-activity caller can return after its existing 900ms UI wait while the shared scan finishes under an independent 10-second hard deadline. The deadline aborts upstream fetches and prevents subsequent chunks/fallback requests; settling a failed scan also cancels its remaining parallel work. Solana activity disables SDK 429 retries. Provider details and wallet addresses are excluded from activity failure logs.

Existing settlement lookup, recovery workers, transfer authorization, bridge progress and transaction submission are unchanged. Activity caching is never settlement proof. Successful cache entries can delay newly discovered external transfers by up to 30 seconds; durable payment/bridge activity is still read by its existing paths.

Indexed incoming/outgoing filters use two log queries per range instead of the former one broad query. This reduces returned unrelated data, but does not by itself prove lower billed CU. Deduplication, caching, budgets and backoff contain repeated work. Measure production/provider usage before claiming savings.

## Validation

- New pocket-activity-rpc-budget smoke: incoming/outgoing/self transfers, unrelated-wallet exclusion, duplicate logs, wallet/owner/network cache separation, short/full request sharing, failure backoff and recovery, quota cooldown, scan concurrency ceiling, hard deadline cancellation, sanitized logs, EVM fallback suppression after cancellation, checkout cancellation isolation, Solana fetch cancellation and no 429 retry.
- Existing evm-read, pocket-activity-adapter, pocket-receipt-policy and pocket-bridge-activity smoke scripts passed.
- Focused TypeScript check of all three changed backend modules passed.
- No funded transaction or real authenticated wallet-history test was performed. No whole-repository clean typecheck claim.

## Release

Release commit, Render status and production observation will be recorded after deployment. No credentials or production environment settings were changed by this patch.

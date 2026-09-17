# Backend EVM read migration — 2026-09-17

Scope: Hash PayLink checkout, Pocket and retained embedded PayStream clients. No standalone PolyDesk changes, wallet-key changes or contract deployment.

## Configuration verified

Render no longer contains frontend RPC variables or old Arc testnet RPC variables. Retain PRIVATE_RPC_URL (Base), PRIVATE_RPC_URL_ARB, PRIVATE_RPC_URL_ARC_MAINNET, SOLANA_RPC_URL and the currently shared POLYMARKET_RPC_URL. Removing a frontend setting does not revoke old provider credentials or replace installed mobile bundles.

## Changes

Shared Viem/Wagmi reads and Circle paymaster preflight reads use `/api/evm-read/:network`. Embedded PayStream explicit public clients use the same route. Browser/native URLs resolve through existing Pocket runtime routing. Circle modular wallet transport, user wallet signing and bundler submission remain provider-specific.

The read endpoint supports four fixed mainnet networks. It rejects transaction submission/signing, custom URLs, state overrides, batches, persistent filters and unrestricted log scans. Contract calls are gas/payload bounded. Log requests require an indexed party and at most 2,048 blocks; checkout recovery now correctly encodes Transfer filters and paginates its attempt window.

Controls: existing 120 requests/IP/minute middleware; 16 unique upstream reads concurrently; 300 upstream attempts/minute/process; in-flight deduplication; short cache (256 entries, at most 64 KiB/result); no nonce/arbitrary contract-read cache; response limit 1 MiB; 8-second upstream timeout and no automatic retry loop. These are per-process limits, not account-wide billing enforcement or distributed protection.

On provider quota/temporary failure, backend reads can use the fixed same-network public endpoint. A 60-second cooldown avoids repeatedly hitting the depleted private provider. No browser fallback is installed. Configuration failures and contract reverts are not retried on the public endpoint. Upstream messages and credentials never enter client errors.

Frontend RPC settings removed from Render blueprint and example env; obsolete fallback removed from Arena server configuration. Removed credential-shaped example from the legacy deploy script. Historical credentials still require provider-side revocation after installed-client migration.

## Validation

- Read-policy/cache/exact-unit/concurrency/cooldown smoke tests passed.
- Real Viem transport over a local HTTP handler passed balance, indexed Transfer scan and prohibited payload/network/write checks.
- Backend balance and Pocket recipient adapters passed.
- Domain routing passed 14 cases.
- Production frontend build passed. Repository typecheck retained 93 baseline diagnostics with no new diagnostics at the checked revision; focused backend typecheck passed.
- No value-moving transaction or real OTP was used for testing. Authenticated wallet signing is not claimed as end-to-end tested.

## Remaining release gates

Verify the deployed backend against Arc/Base/Arbitrum. Existing installed Pocket apps need a newly packaged/distributed native build before their baked-in frontend credentials can be considered retired. Backend key rotation, Solana provider repair and coordinated shared Polygon rotation remain separate steps; this migration does not reset Alchemy allowance or revoke keys.

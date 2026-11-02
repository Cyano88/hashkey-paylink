# Durable wallet event recovery - 2026-11-02

## Coverage and boundaries

| Wallet path | Discovery / event source | Recovery added or existing |
| --- | --- | --- |
| Base, Arbitrum, Ethereum, Polygon | USDC + configured USDT logs; Circle inbound/outbound notifications | New per-owner/network/address finalized-block checkpoint |
| Arc | USDC transfer logs; Circle inbound/outbound notifications | New finalized-block checkpoint; existing public-RPC pacing retained |
| Solana | USDC/USDT associated token accounts; Circle inbound/outbound notifications | New per-owner/address/mint finalized-signature pagination |
| BSC | Existing OKX transaction discovery and canonical proofs | Existing durable history pages and pending-proof retries |
| X Layer | Existing indexed native discovery and stablecoin logs | Existing durable block cursor and canonical replay |

This is wallet activity, not settlement authorization. Arbitrary tokens, non-associated Solana token accounts, and general internal-native transfer coverage are not newly claimed. Provider history availability is required. The current capped activity-feed retention remains unchanged. These checkpoints start from an activation baseline (EVM: recent finalized 120 blocks; Solana: current page plus the existing recent scan), not a claim of complete lifetime history.

## Recovery semantics

Recent scans remain active. Each successful recent scan saves its rows before a bounded five-second recovery attempt. EVM recovery freezes the initial starting block durably, reads at most 480 contiguous finalized blocks (smaller under explicit range limits), verifies the previous anchor and log block hashes, and saves activity before advancing. Incomplete results, provider errors, changed finalized anchors and storage failures do not advance the cursor. Dense or deadline-limited batches shrink without skipping blocks. A changed finalized anchor deliberately stays pending rather than silently accepting divergent history.

Solana recovers five finalized signatures per mint per pass using saved before/until cursors. Pages and their candidate newest signature survive restart. Null/missing transaction proofs do not advance. Failed on-chain transactions yield no transfer row. The newest checkpoint advances only after the bounded page sequence is exhausted. RPC pruning can limit historical recovery and cannot be inferred as complete lifetime coverage.

Compare-and-set updates prevent stale replicas from rewinding or replacing progress. Activity-first/checkpoint-second ordering deliberately allows idempotent replay after a crash. Recovery RPC endpoints verify their actual chain identity. Recent reads and all payment/checkout settlement paths keep their existing behavior.

## Signed event inbox

New raw-body endpoint: /api/pocket/wallet-events. Circle ECDSA signatures are verified with the same public-key validation used by gifts. Inbound/outbound CONFIRMED or COMPLETE events for linked payment wallets enter a durable transaction-keyed inbox. Duplicates do not reset processing. Unknown wallet products do not establish ownership.

The worker fetches the transaction through authenticated Circle APIs, binds transaction/wallet/blockchain/state to the current wallet link, then requires finalized canonical chain evidence. Only supported transfer rows are persisted. Payload amounts never become payment proof. Missing/unfinalized evidence stays pending with bounded exponential backoff. Zero supported rows do not imply token-event coverage. Existing gifts subscription and scans are retained.

Official references: https://developers.circle.com/api-reference/wallets/common/create-subscription and https://developers.circle.com/openapi/configurations_2.yaml document transactions.inbound/outbound and payload fields; https://developers.circle.com/wallets/blockchain-infrastructure documents indexing. A live read of /v1/w3s/config/entity/monitoredTokens returned HTTP 204 with no body, so account token-monitoring scope is unverified. Subscription activation is not evidence of end-to-end delivery for every chain/token.

## Validation

Passed recovery replay/storage failure/abort/CAS/range/pagination/owner-isolation fixtures; signed inbox tamper/idempotency/storage retry/owner binding/finality/canonical block fixtures; existing EVM reads, activity budget/recovery, durable activity, Arc pacing and gift event-discovery fixtures; targeted recovery/inbox TypeScript check. Existing pocket-usdt-send-smoke fails with the same 503 on the unchanged release checkout and this worktree; it is not reported as a passing check.

Live rollout evidence will be appended after deployment and subscription verification. No funds are sent for validation.

## Initial live checks and empty-wallet correction

Initial deployment 585aa4475 became live at 2026-11-02 02:37:22.998 UTC (dep-dbjvc47b9u1s73f60o4g). Health was healthy with zero unresolved/stale payments; unsigned webhook POST returned 401. The deployed proof reader verified two existing Base transactions into three supported transfer rows without persisting the test results or sending funds. Durable EVM checkpoints were present and sampled Polygon/Arc recovery logs reached zero lag; Solana recovery pages also completed.

Circle accepted subscription 7cee6d3c-5c38-4dd5-a744-f3e70c335d4f at the wallet-events endpoint, enabled with normalized transactions.* types. A subsequent GET confirmed the prior contracts.* gifts subscription remains enabled. The list API returns data as an array; the initial creation script's reported existing count of zero was a parsing mistake, not deletion of the gift subscription. No gift settings were changed.

Live empty Solana pages prompted an additional first-deposit edge-case test. Empty/new mint histories now save a finalized slot baseline, then paginate all later signatures even before any head signature exists. A burst exceeding five entries no longer becomes an implicit first-page baseline. The new fixture verifies a ten-signature burst across restart-safe pages. getSlot is read-only and restricted to the internal Solana read transport; the existing signature/transaction budgets remain.

Subscription enablement and historical proof checks are not evidence that every chain/token has delivered a real signed event. Monitored-token scope returned HTTP 204 and remains unverified. Existing scans are still required.

Final revision bf23892b6b75ed1d01c912d0f8fd3d936f3d0b56 deployed as dep-dbjvhljbc2fs73dvu7e0, live 2026-11-02 02:48:46.288 UTC. Source build passed. The transition 502 recovered; health again reports healthy database and zero unresolved/stale payments. Read-only durable inspection found eight EVM checkpoints (Base 2, Arbitrum 2, Arc 2, Polygon 1, Ethereum 1) and four Solana mint states: two with existing signature heads and two empty histories now protected by finalized-slot baselines. Subsequent Arc/Polygon recovery samples reached zero lag and Solana page processing continued. These are observed active-wallet snapshots, not a lifetime-history or all-wallet completeness claim. No funds were sent, no historical proof fixture was persisted, and no settlement authority changed.

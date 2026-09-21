# Pocket activity and balance review ? 2026-09-21

The balance findings below were subsequently addressed in [the balance and refresh implementation](2026-09-21-pocket-balance-refresh-verification.md). This file preserves the initial comparison.

Scope: local source comparison of Pocket, Hash PayLink, and standalone Hash PayStream. The Hash PayStream checkout contains existing uncommitted changes; these findings describe that checkout, not a verified production deployment. Hash PayStream was read only. No transaction, approval, activation, deployment, or phone installation was performed for this change.

## Activity comparison

| Flow | Retention | Loading behavior | Finding |
| --- | --- | --- | --- |
| Pocket before this change | Receipts and action journals are durable, but direct wallet activity came from a short moving RPC window with a two-minute memory cache. The client replaced rows with each response. | POS, wallet scans, receipt repair and other sources blocked the aggregate response. Only activity rows, not POS resources, survived a device restart. | Bounded or partial reads could make history disappear. |
| Hash PayLink | Event receipts and POS orders are saved. | POS history performs synchronous receipt repair; its generic balance/history views are not uniformly cached. | Stronger saved receipt retention, but listing can wait on provider work. |
| Standalone Hash PayStream | Verified Arc transfer records and service-request events use atomic durable storage. Agreement timelines supply activity events. | Some in-memory caches; the Activity screen waits for agreement, account and request loading flags together. | Stronger transfer journal, but does not provide the best cold-load experience. |
| Pocket after this change | Per-owner durable projection merges observed history atomically; omission from a scan is not deletion. Existing background wallet scans persist observations too. | Saved rows and POS resources render from the device cache immediately. Independent server source refreshes update the saved view. | Combines durable source records with immediate cached display and independent refresh. |

Implementation:

- `api/pocket/activity-feed.ts`: authenticated per-owner read model, independent source refreshes, bounded concurrent owners, refresh deduplication, explicit partial/freshness metadata and sanitized failures.
- `api/pocket/activity-store.ts`: existing Postgres atomic mutation boundary in production; serialized atomic local files for single-process development. Production storage failures do not silently fall back to volatile or local storage.
- `api/pocket/wallet-activity-cache.ts` and `wallet-chain-activity.ts`: persist successful observed transfers even when a short UI wait finishes first; retain existing RPC limits.
- `api/ng-pos.ts`: independent resource read and a read-only history option for Pocket. Other callers retain their current behavior. Existing settlement/reconciliation paths remain authoritative.
- `pocketActivitySnapshot.ts`: retain absent rows, chain-aware identities, contextual transfer deduplication, stable original dates, current provider status and removal of expired refund actions.
- `pocketActivityCache.ts` and `usePocketActivity.ts`: shared recent/full snapshot, device persistence for rows and resources, single-flight reads, cached first display, old-cache recovery, account-change guards and bounded requests. Prefetch cancellation remains supported.
- `PocketActivityPage.tsx`: late request responses are account-scoped; a separate request read no longer blocks the entire payment list.
- `PocketHomePage.tsx`: at most four Recent activity records.

Limits: this retains observed transfers and rebuilds existing receipt/journal history. It cannot reconstruct transactions that were never recorded and have already left the bounded chain scan window; those require a separate historical backfill. Saved display data is not payment or settlement proof. Durable history is not pruned by this change; large-history pagination/indexing remains a scaling consideration.

## Balance comparison and audit

Pocket is not yet the strongest end-to-end balance flow.

Its backend is the strongest multi-network aggregation of the three inspected implementations: independent network reads run concurrently, private RPC is used through the shared read layer, failures have an explicit network status, and the API reports `totalComplete` and `unavailableNetworks`. EVM balance reads already have a five-second address/network cache, single-flight requests, a bounded pending set, and exact-unit reads for execution/migration. Payment controllers already request a refresh after money movement.

Hash PayLink's generic `queryBalances` reads selected chains sequentially. Dashboard failure paths can reset displayed totals to zero. This is weaker for latency and outage display.

Hash PayStream restores cached balance data from device storage. Its X Layer cache checks the wallet address and stores exact units. Its Arc cache is email-based, has no freshness timestamp, and can suppress errors after a prior success. Faster cached display alone does not make it the strongest correctness model.

Pocket gaps, in priority order:

1. **Unknown can look like zero.** The API correctly returns `status: error` and `totalComplete: false`, but Home reads the selected row's numeric balance without its status. A failed chain can therefore show `0 USDC`; an incomplete sum is still headed ?Total USDC.? Show an unavailable state or a clearly dated last-known value instead of a current zero/full total.
2. **No persistent balance snapshot.** `usePocketWallets` caches only in module memory. Reopening the app loses it. Persist display snapshots keyed by authenticated owner plus network and wallet address, with `observedAt`; never reuse an old wallet's balance after activation/migration.
3. **No address/version binding in the balance response.** Linked-wallet and balance requests run separately; the balance rows do not identify which wallet version was read. A migration between reads can pair old balances with new wallet metadata. Return an address or wallet revision per row and reject mismatched snapshots.
4. **Cold fallback can manufacture a zero.** `circleAmount` starts at zero, treats missing confirmed amounts as zero, and does not require a matching chain result. An empty/malformed provider result should be unavailable; only an explicit valid zero is zero.
5. **Refresh lifecycle gaps.** Balance fetch itself has no client abort/deadline, prefetch and mounted reads are separate, and refresh is normally every 45 seconds. Existing local `usePocketReadScope` guards improve account isolation and were preserved; those guards differ from the older deployed release code. Use one owner/address-scoped request coordinator and a bounded request lifetime, with event-driven refresh after confirmed money movement.

The balance flow was audited, not rewritten in this change. A stronger implementation should combine Pocket's authenticated parallel backend with address-bound persistent snapshots and explicit stale/unavailable states, while keeping fresh execution checks separate from display caching.

## Verification

Passed:

- Durable activity tests: process restart, empty/provider-failed response retention, POS availability while RPC waits, single-flight refresh, owner separation, max-four recent preview, mutable/refund statuses, cross-chain identity, persistence after short UI deadlines and database failure behavior.
- Browser tests: cached history and POS before network completion, full page reload, account-switch races, shared prefetch, empty refresh retention and real Home/route-shell scrolling at 320/390/480 px.
- Existing activity adapter, RPC-budget, POS adapter, bridge activity, POS settlement route, money push worker and balance adapter tests. The POS route test logs expected local-provider/storage fallback warnings and passes.
- Frontend production build in the isolated release checkout.
- TypeScript comparison: 48 existing diagnostics, 48 after the changes, zero newly introduced diagnostic signatures.
- Reviewed three-way merge into the main local checkout; only the activity-hook conflict needed manual resolution. Prior files are saved in `.codex-temp/activity-merge-review/main-before`. The new hook preserves the old cancellation API and account-isolation intent.
- Main checkout durable and browser activity tests passed after merge.

The broad legacy `circle-pocket-contracts-smoke.mjs` still stops at line 728 on its pre-existing balance expectation omitting `walletUpdate: hidden`; this is not an activity failure. Obsolete activity implementation-string assertions were removed/replaced by the dedicated behavioral coverage. Full TypeScript is not clean due to the existing 48 diagnostics.

Local changes only. No claim of production rollout or physical Android verification for this activity change.

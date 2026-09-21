# Pocket saved balances and pull-to-refresh - 2026-09-21

This supersedes the balance recommendations in the earlier activity/balance comparison. Changes were implemented in the main local checkout, then copied to the isolated release checkout without publishing unrelated work.

## Behavior

- Home shows a saved balance immediately, with quiet background revalidation and no last-updated or retry CTA on the card. Shimmers appear only for values without a known snapshot. Failed reads never replace a known amount with zero. A real verified zero does replace it.
- New values are accepted only when the balance response matches the current linked-wallet revision. Replacing/migrating a wallet invalidates the previous wallet's amounts. Cached values are display-only; spending/controller rows do not treat stale display amounts as fresh funds.
- Owner-scoped snapshots survive app reloads. Requests are shared across Home, other mounted screens, prefetch and manual refresh. Late account responses are guarded, including React StrictMode replay.
- Confirmed deposits appear on automatic refresh while Pocket is visible. Healthy reads run every 45 seconds; returning to the app triggers a throttled refresh. This is polling, not instant chain subscription; network confirmation/provider delays still apply.
- Failed reads back off at 15, 30 and 60 seconds. Hidden tabs do not poll. Device-cache reads consume no RPC units. Manual refresh requests fresh balances, shares in-flight reads, and reuses responses less than 1.5 seconds old to limit bursts. Existing exact execution/migration reads remain separate.
- The pull-to-refresh target is 44 px, with a 24 px active spinner. A deliberate 100 px downward drag from the top starts work immediately; an 80 px drag does not refresh. The indicator only spins during actual refresh; the old artificial three-second completion was removed. Repeated pulls share work. Balance reads have a ten-second deadline; manual activity reads have an eighteen-second client deadline and bounded source refreshes. Activity retains its source/RPC cooldowns. A twenty-second outer refresh deadline reports a retry state if another registered read stalls, rather than spinning forever or showing success.
- A malformed/empty Circle fallback response is no longer accepted as a zero balance. The API returns opaque wallet revisions and observation timestamps rather than exposing wallet addresses in balance rows.

## Verification before deployment

- New synthetic balance tests cover zero vs unknown, provider failure, saved display, revision mismatch, replacement wallet invalidation, cross-network/address identity, fresh manual reads, RPC deduplication and refresh completion.
- Real Chrome fixture tests cover initial shimmer, saved values through a slow/failed refresh, persistence across reload, automatic deposit updates without a user refresh, hidden-tab polling suppression, account isolation, StrictMode request deduplication and the enlarged ring remaining active beyond three seconds until completion.
- Existing exact-unit/backend balance tests, balance adapter tests, durable activity tests and wallet-activity RPC budget tests pass.
- Frontend Vite build passed. Full TypeScript has the same 48 baseline diagnostics and zero newly introduced diagnostic signatures. Android/deployment verification is recorded separately when complete.

Production and phone installation status will be recorded after deployment; this document does not itself claim a completed rollout.

## Follow-up verification

- Notification release `d15a8862b` is live with HTTP 200 health. Authenticated phone checks observed successful notification GETs using the 120/min read limit and successful POSTs retaining the 20/min strict limit, with no 429 or client exception. Inbox reads are shared, rate-limit retries honor Retry-After, and an unsuccessful read receipt cannot hide loaded items.
- The final balance UI removes the freshness/retry labels requested by the user while retaining stale-state handling internally. The Chrome balance regression covers this alongside automatic refresh and short-drag suppression.
- Bills uses ReceiptPercent, Bank uses BuildingLibrary, Request uses DocumentPlus, and Deposit uses ArrowDownTray from the existing Heroicons outline set. Home and Activity navigation use Home and QueueList. Wallet and purchase actions use distinct Wallet and CreditCard icons.

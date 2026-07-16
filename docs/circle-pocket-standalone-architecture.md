# Circle Pocket Standalone Architecture

## Decision

Circle Pocket will become a dedicated financial-app experience at `pocket.hashpaylink.com` while initially remaining in the Hash PayLink repository and Render service.

Hash PayLink remains the platform and owns Agent Hash, shared identity entry, public PayLinks, receipts, and the Service Hub. Circle Pocket owns its wallet, payment-request, bank-receive, POS, bills, x402, and account-activity domain. Agent Hash accesses Circle Pocket through an authenticated Circle Pocket API contract.

Do not create a second Circle Pocket repository or database during the first migration. Establish clean UI, routing, API, identity, and deployment boundaries first.

## Product and hostname map

| Surface | Host | Responsibility |
| --- | --- | --- |
| Hash PayLink | `hashpaylink.com` | Platform home, Service Hub, Agent Hash, public payment and receipt surfaces |
| Circle Pocket | `pocket.hashpaylink.com` | Authenticated wallet and everyday-money application |
| PolyDesk | Standalone PolyDesk host | Polymarket agent, portfolio, World Cup, LP Scout, funding, and trading |
| Hash Paystream | Existing standalone host | Streaming payments and creator services |

Public PayLinks should continue to use the trusted Hash PayLink payment origin unless a later security and brand review deliberately moves them.

## Ownership boundaries

### Hash PayLink owns

- Agent Hash shell, global mode selection, and shared conversation identity.
- Public PayLink and receipt presentation.
- Cross-product entry and return URLs.
- Shared authentication bootstrap and platform policy.

### Circle Pocket owns

- Smart Wallet and x402 wallet views.
- Balances, funding addresses, and authenticated transfers.
- Direct USDC PayLink creation.
- Receive to Bank and POS creation.
- Bills and local-currency receipts.
- Circle Pocket activity and action journal.
- Circle Pocket agent intents, slot filling, confirmation, and action execution.

### The browser must not own

- Service credentials or privileged API-to-API tokens.
- Ownership decisions based on user-supplied IDs or email addresses.
- Financial-action idempotency or authorization policy.
- Durable transaction state.

## Frontend target structure

```text
src/
  pocket/
    CirclePocketApp.tsx
    CirclePocketRouter.tsx
    layouts/
      PocketLayout.tsx
    pages/
      PocketHomePage.tsx
      PocketMovePage.tsx
      PocketBillsPage.tsx
      PocketActivityPage.tsx
      PocketAssistantPage.tsx
    features/
      wallet/
      x402/
      paylinks/
      bank-receive/
      pos/
      bills/
      activity/
      assistant/
    components/
      PocketTopSwitch.tsx
      PocketBottomNav.tsx
      PocketSignInCard.tsx
      PocketAmountInput.tsx
      PocketConfirmationSheet.tsx
      PocketResultCard.tsx
      PocketErrorState.tsx
    hooks/
      usePocketIdentity.ts
      usePocketWallets.ts
      usePocketActivity.ts
    lib/
      pocketApi.ts
      pocketRoutes.ts
      pocketSchemas.ts
      pocketIdempotency.ts
```

Reusable primitives may remain under `src/components`, but Circle Pocket business state must leave `CreateLink.tsx` and `Layout.tsx`.

## Route model

Routes are the source of navigation state. Refresh, Back, Forward, shared links, and direct entry must reconstruct the same screen without `window` events.

```text
/                         -> Home / Smart Wallet
/home/smart-wallet        -> Smart Wallet
/home/x402                -> x402 wallet
/move/usdc                 -> Direct USDC PayLink
/move/bank                 -> Receive to Bank
/move/pos                  -> POS terminal
/bills/airtime             -> Airtime
/bills/data                -> Data
/bills/tv                  -> TV
/bills/electricity         -> Electricity
/activity                  -> All activity
/activity/bank             -> Bank receive activity
/activity/pos              -> POS activity
/activity/bills            -> Bills activity
/assistant                 -> Agent Hash locked to Circle Pocket context
```

The top selector derives from the route. The bottom navigation changes routes. No Circle Pocket navigation state should depend on custom browser events.

## API facade

Introduce stable Circle Pocket endpoints while temporarily adapting them to the existing handlers.

```text
GET    /api/pocket/session
GET    /api/pocket/wallets
POST   /api/pocket/wallets/link
DELETE /api/pocket/wallets/:network
GET    /api/pocket/balances
POST   /api/pocket/balances/recipient
POST   /api/pocket/transfers/prepare
POST   /api/pocket/transfers/submit
POST   /api/pocket/paylinks
POST   /api/pocket/bank-receive
GET    /api/pocket/bank-receive/institutions
POST   /api/pocket/bank-receive/verify
POST   /api/pocket/bank-send
POST   /api/pocket/pos
POST   /api/pocket/bills/quote
POST   /api/pocket/bills/pay
GET    /api/pocket/activity
POST   /api/pocket/agent/ask
POST   /api/pocket/agent/confirm
```

Initial adapters can call the existing `privy-circle-link`, `telegram-request`, `ng-pos`, `circle-pocket-actions`, and Agent Hash domain functions. New frontend code must depend only on `/api/pocket/*` contracts.

Every mutation returns a common envelope:

```ts
type PocketMutationResult<T> = {
  ok: boolean
  requestId: string
  idempotencyKey: string
  status: 'requires_confirmation' | 'processing' | 'completed' | 'failed'
  data?: T
  error?: { code: string; message: string; retryable: boolean }
}
```

## Identity and authorization

Use three explicit access levels:

1. **Public**: view a public PayLink or receipt. No private account data.
2. **Guest session**: prepare an unsaved draft using the browser session. No saved wallet, bank, POS, history, or transfer access.
3. **Authenticated account**: verified Privy bearer token mapped server-side to one canonical owner ID.

Require authenticated access for saved wallets, balances, bank details, POS merchants, bills, activity, memory, and all account-affecting actions. Require a fresh confirmation or wallet signature for transfers, destination changes, and other high-risk actions.

Rules:

- Never accept `owner_id`, payer email, or profile key as proof of ownership.
- Use host-only secure sessions where cookies are needed; do not set a broad `.hashpaylink.com` domain cookie.
- Prefer short-lived bearer tokens for the Pocket API.
- Allow CORS only from the exact production and approved preview origins.
- Use an idempotency key on every mutation and enforce it server-side.
- Encrypt verified bank details at rest and never return full account numbers after verification.
- Record security-relevant actions in a durable append-oriented journal.

## Agent Hash contract

Agent Hash remains a Hash PayLink product. Circle Pocket supplies a domain adapter that understands its intents and performs its actions.

Agent Hash sends:

```ts
type CirclePocketAgentRequest = {
  threadId: string
  message: string
  identityToken?: string
  locale?: string
  draft?: Record<string, unknown>
  confirmationId?: string
}
```

Circle Pocket returns structured UI, not only prose:

```ts
type CirclePocketAgentResponse = {
  answer: string
  intent: string
  draft?: Record<string, unknown>
  missingFields?: string[]
  confirmation?: {
    id: string
    summary: string
    expiresAt: string
  }
  card?: Record<string, unknown>
  actions?: Array<{ id: string; label: string; href?: string }>
  proof?: Record<string, unknown>
}
```

The backend deterministically parses and validates financial fields. ZeroScout/0G may enrich explanation and guidance, but it must not decide ownership, amounts, recipients, confirmation state, or whether an action succeeded.

## PWA rules

Circle Pocket receives its own manifest, icon set, theme colors, start URL, and service worker scope.

- Use `display: standalone` and `start_url: /`.
- Cache only versioned static assets and the minimal application shell.
- Never cache authenticated API responses, balances, bank information, transaction payloads, or Agent Hash private threads.
- Show an explicit update/reload prompt when a new app version is ready.
- Display a clear offline state; never show a stale balance as current.
- Deep links must reopen their intended route after authentication.

## Deployment stages

### Phase 0 - Contract and regression baseline

- Capture the existing Home, Move, Bills, Activity, and Circle Pocket Agent Hash flows in tests.
- Define shared request/response schemas and error codes.
- Record existing public and authenticated route behavior.

**Gate:** current production flows pass before extraction begins.

### Phase 1 - Extract without redesign

- Move Circle Pocket UI and state from `CreateLink.tsx` and `Layout.tsx` into `src/pocket`.
- Preserve the current accepted UI and copy.
- Replace custom navigation events with a Pocket router.
- Keep the existing Hash PayLink URL available during this phase.

**Gate:** visual parity, refresh persistence, browser Back/Forward, keyboard behavior, and mobile scroll pass.

### Phase 2 - Introduce the Pocket API facade

- Add `/api/pocket/*` endpoints and schemas.
- Wrap legacy endpoints behind adapters.
- Centralize Privy identity, authorization, idempotency, validation, and audit recording.
- Remove direct frontend knowledge of legacy endpoint names.

**Gate:** ownership isolation, duplicate-submit, expired-session, foreign-resource, and PII tests pass.

### Phase 3 - Add hostname-based mounting

- Add `IS_POCKET_HOST` and `?app=pocket` local development routing.
- Point `pocket.hashpaylink.com` to the existing Render service.
- Register the hostname in Privy, Circle, WalletConnect, CSP, CORS, and allowed redirect settings.
- Add exact-origin security headers and the Pocket PWA manifest.

**Gate:** sign-in, wallet restore, PayLink creation, bank receive, POS, bills, activity, and Agent Hash pass on the production hostname.

### Phase 4 - Controlled cutover

- Open Circle Pocket links on the new hostname.
- Keep the old embedded route as a compatibility redirect with an allowlisted `returnTo` value.
- Monitor authorization failures, duplicate mutations, wallet restore, and API latency.
- Retain an environment flag that sends users back to the embedded surface during rollout.

**Gate:** stable production metrics and no unresolved financial-action regressions.

### Phase 5 - Optional service separation

Only after the boundary is stable, evaluate a separate Render service or repository. If separated, keep one canonical database identity, signed service-to-service capabilities, independently scoped secrets, and zero browser-visible service credentials.

## Required verification matrix

- Refresh on every Pocket route stays on the same screen.
- Back and Forward preserve the correct top selector and bottom tab.
- Anonymous users cannot read saved wallets, activity, bank data, or Agent memory.
- User A cannot read or mutate User B resources by changing IDs.
- Repeated mutation with the same idempotency key creates one resource.
- Expired tokens fail closed and preserve only safe local draft fields.
- Wallet restore works on every supported network.
- Transfer and destination changes require explicit confirmation/signature.
- PayLink, bank-receive, POS, and bill cards show shareable completed results.
- No CTA is hidden behind the bottom navigation or mobile keyboard.
- Offline mode never presents cached financial state as live.
- Agent Hash never claims an action succeeded without a backend result.
- Existing public PayLinks and receipts remain valid throughout migration.

## Explicit non-goals for the first release

- No new Circle Pocket repository.
- No duplicate database.
- No broad cross-subdomain session cookie.
- No redesign of already accepted Circle Pocket screens during extraction.
- No migration of public PayLink URLs until separately approved.
- No merging of PolyDesk business logic into Circle Pocket.

## Implementation status

### Phase 0 complete

- Canonical routes, API names, mutation/error envelopes, idempotency helpers, and Agent Hash contracts live under `src/pocket/lib`.
- `npm run test:pocket` covers the new contracts plus the existing Circle Pocket identity/idempotency and payment-conversation regressions.

### Phase 1 route boundary complete

- `src/pocket/CirclePocketApp.tsx` owns the transitional `/pocket/*` application entry.
- Canonical Smart Wallet Home, Bills, and Activity routes now render through Pocket-owned pages instead of the transitional `CreateLink` shell.
- Home, Smart Wallet, x402, Move, Bank, POS, Bills, Activity, and Circle Pocket Assistant routes reconstruct the existing accepted UI state.
- Pocket navigation updates canonical URLs so refresh and browser history no longer depend only on component memory.
- Smart Wallet Home composes the extracted identity, wallet, profile, wallet-session, and withdrawal boundaries. Bills and Activity contain only their extracted profile/read boundaries and accepted presentation. x402, Move, and Assistant remain transitional.

### Phase 1 shared navigation extracted

- `src/pocket/components/PocketTopSwitch.tsx` now owns the pinned Smart Wallet/x402, Move, Bills, and Activity selectors.
- `src/pocket/components/PocketBottomNav.tsx` now owns the Home, Move, Bills, and Activity navigation, including keyboard hiding and safe-area behavior.
- `Layout.tsx` and both `CreateLink.tsx` shell paths consume the same components, removing the previous duplicated markup without changing accepted labels or styling.

### Phase 1 Home and Activity presentation extracted

- `src/pocket/features/home/PocketHomeOverview.tsx` owns the total-balance and supported-wallet-network presentation.
- `src/pocket/features/home/PocketHomeControls.tsx` owns the signed-in Balance/Fund/Withdraw/Activity switch, network selector, funding-address panel, withdrawal form, session activity, error state, and Smart Wallet sign-in card.
- `src/pocket/features/activity/PocketActivityPanel.tsx` owns Activity headings, filtering, receipt rows, empty/error states, refresh control, and the signed-out CTA.
- Existing wallet setup, balance refresh, history loading, profile editing, and funding actions remain single-sourced in `CreateLink.tsx` and are passed into Pocket features through typed props. Withdrawal draft, validation, Circle signing, submission, and result state now cross the Pocket-owned withdrawal controller.
- Activity filtering continues to exclude the legacy bank-send/onramp records and its regression assertion now reads the extracted feature source.

### Phase 1 Move and Bills shell presentation extracted

- `src/pocket/features/move/PocketMoveLanding.tsx` owns the Move transition/selector landing state.
- `src/pocket/features/bills/PocketBillsPanel.tsx` owns bill-category metadata, headings, provider-pending state, profile slot, and the signed-out Bills CTA.
- Canonical Move routes still hand off to the existing USDC, bank-receive, and POS controllers so link creation, verified-bank checks, QR creation, and signing behavior remain unchanged.
- Canonical Bills routes remain URL-backed and reconstruct Airtime, Data, TV, and Electricity selections through the shared pinned selector.

### Phase 1 Move controller boundary introduced

- `src/pocket/controllers/usePocketMoveControllers.ts` defines typed controller snapshots for direct USDC PayLinks, Receive-to-Bank, and POS terminal creation.
- Each controller exposes its lane, normalized draft, readiness, submitting/completed status, and submit action.
- The existing USDC, bank, and POS submit buttons now consume these controllers while API calls, idempotency refs, verified-bank checks, and wallet/signing logic remain in `CreateLink.tsx`.
- Controller status precedence is covered by the Circle Pocket contract smoke suite.

### Phase 1 shared PayLink form presentation extracted

- `src/pocket/features/move/PocketPayLinkFields.tsx` owns the shared amount field, payment note, flexible-amount switch, submit CTA, and readiness guidance used by direct USDC and Receive-to-Bank PayLinks.
- `src/pocket/features/move/PocketRecipientAddressFields.tsx` owns the existing EVM and Solana recipient-address presentation, validation feedback, connected-wallet labels, and disconnect controls.
- `src/pocket/features/move/PocketVerifiedBankFields.tsx` owns the existing country, institution, account-number, verification, account-name, and error presentation for Receive-to-Bank.
- The same presentation boundary preserves the legacy bank-send lane without merging it into Circle Pocket Activity or changing its existing behavior.
- The typed USDC and bank controller contracts now expose recipient-address and verified-bank field actions; authentication, wallet resolution, verification requests, submission mutations, and idempotency behavior remain single-sourced in `CreateLink.tsx`.
- Receive-method and payer-network orchestration remains in `CreateLink.tsx`; its presentation now consumes typed state and controller actions.

### Phase 1 POS and local-currency presentation extracted

- `src/pocket/features/move/PocketPosPanels.tsx` owns the accepted POS shell, country selector, Nigeria setup form, completed static-QR presentation, and POS sign-in card.
- `src/pocket/components/LocalCurrencyProfileCard.tsx` owns the shared payout-profile and local-currency sign-in presentation used by bank receive, POS, and bills.
- The typed POS controller now exposes country-selection, merchant-name, network, bank-field, and verification actions consumed by the extracted panels.
- Paycrest account verification, merchant creation, link copying, Back behavior, and route transitions remain single-sourced in `CreateLink.tsx`; profile persistence now crosses the dedicated Pocket profile adapter.
- Existing POS wording, network selection rules, validation, dark-theme classes, QR size, payer-link copy action, and payments-dashboard link remain unchanged.

### Phase 1 Receive USDC presentation extracted

- `src/pocket/features/move/PocketReceiveMethodPanel.tsx` owns the accepted paste-wallet, Circle Pocket email-wallet, wallet-status, bank-field slot, and unsupported-Solana presentation.
- `src/pocket/features/move/PocketPayerNetworkPanel.tsx` owns the accepted payer-network selector, multi-network switch, and receiving-address guidance.
- The typed USDC controller exposes network selection and multi-network toggling while its callbacks continue to invoke the existing page handlers.
- Privy authentication controls remain page-owned slots, and email-wallet resolution/linking, access-token reads, wallet balance reads, supported-chain decisions, disconnection, address resets, and generated-link invalidation remain single-sourced in `CreateLink.tsx`.
- The disabled legacy payer-network experiment remains untouched and is not part of the extracted Circle Pocket route.

### Phase 1 PayLink completion presentation extracted

- `src/pocket/features/move/PocketPayLinkReadyPanel.tsx` owns the accepted Link Ready heading, amount and recipient preview, payment-note display, QR presentation, Share/Save/Test/Start over controls, payments-dashboard links, and legacy multi-payer/access guidance.
- `CreateLink.tsx` continues to own generated-link state, amount and network formatting inputs, share/reset/download behavior, dashboard URL construction, and the QR refs used by the existing download implementation.
- The existing direct, bank-receive, legacy bank-send, multi-payer, and access-mode result branches remain represented by typed props without changing their accepted wording or controls.
- Contract checks keep API calls, idempotency, browser sharing, and dashboard URL construction out of the extracted presentation.

### Next architectural boundary

- Phase 1 presentation separation is complete for the current Circle Pocket route surface.
- Keep wallet signing and financial mutations single-sourced while introducing the Pocket API facade one operation at a time, beginning with read-only contracts before any write path moves.

### Phase 2 API facade started

- `src/pocket/api/pocketReadClient.ts` owns authenticated payout-profile reads and saves through `/api/pocket/profile` and validates both response shapes before returning typed data.
- `src/pocket/models/localCurrencyProfile.ts` is the shared UI/API profile model, so the read client does not depend on a presentation component.
- `CreateLink.tsx` delegates profile loading and saving to the facade while retaining authentication state, UI state transitions, and error display; `Dashboard.tsx` uses the same read boundary.
- No bank verification, wallet, signing, POS, transfer, PayLink, or financial write path moved in this slice.

### Phase 2 activity read facade extracted

- `src/pocket/models/pocketActivity.ts` is the shared activity-row model consumed by the read client, Activity presentation, and page state.
- `src/pocket/api/pocketReadClient.ts` validates and loads authenticated Circle Pocket activity through `GET /api/pocket/activity`.
- `CreateLink.tsx` retains access-token acquisition, loading/error state, refresh timing, descending timestamp sorting, and Activity visibility/filtering behavior.
- The facade contract rejects malformed activity rows and excludes bank verification, merchant creation, bank receive, idempotency, transfers, submission, and all other write operations.

### Phase 2 multi-wallet balance read extracted

- `src/pocket/models/pocketWallet.ts` is the shared Circle Pocket wallet-map model used by page state and the read facade.
- `readPocketBalances` now uses the authenticated `/api/pocket/balances` facade while preserving the Base, Arbitrum, Arc, and Solana sequence, zero-balance rows for missing wallets, per-network status, and total calculation.
- `CreateLink.tsx` retains refresh timing, loading/error state, wallet restoration and setup, selected-network state, and UI updates.
- Contract tests inject the facade transport and verify bearer authentication, response validation, network order, error rows, and the aggregate total without making live network requests.

### Phase 2 recipient balance read extracted

- `readPocketRecipientBalance` preserves the existing Solana `/api/solana-balance` request and six-decimal conversion plus the existing direct EVM USDC `balanceOf` contract read and per-network decimals.
- `CircleReceiveSelector` retains wallet-validity and selected-network decisions, effect timing, stale-result cancellation, loading/fallback labels, display formatting, and email-wallet orchestration.
- This read deliberately does not use the broader unified-balance fallback, so its current recipient-wallet behavior remains unchanged.
- Contract tests inject both transports and verify the exact Solana endpoint/body and EVM network/address routing without live network access.

### Phase 2 linked-wallet hydration read extracted

- `readPocketLinkedWallets` loads persisted Base, Arbitrum, Arc, and Solana payment links through one authenticated `/api/pocket/wallets` request.
- Missing links remain absent from the resulting wallet map, while persisted address, wallet ID, blockchain, and `updatedAt` fields retain their existing mapping.
- `CreateLink.tsx` retains authentication and access-token acquisition, effect cancellation, signed-out cleanup, wallet/balance state updates, and the follow-up balance refresh.
- Wallet setup decisions remain page-owned because they are coupled to conditional wallet creation and link persistence; the actual read transport is owned by the validated Pocket client.

### Phase 2 mutation policy manifest added

- `src/pocket/commands/pocketCommandContracts.ts` records the observed profile-save, wallet-link/unlink, bank-verification, POS-create, bank-receive-create, bank-send-create, EVM-withdraw, and Solana prepare/submit boundaries.
- Each command records its transport/action, transport authentication, idempotency status, user-approval boundary, risk class, and execution status.
- The manifest is deliberately non-executable: it contains no fetcher, command sender, credentials, or payload data. Profile saving and payment-purpose wallet link/unlink are `pocket-adapter` entries; the remaining commands stay `legacy-page-only`.
- The review exposes current differences instead of hiding them behind one abstraction: profile, wallet-link, POS, and bank-receive creation require idempotency; Solana relay transports currently have no bearer authentication; withdrawals require a wallet approval or signed payload. Bank verification now uses the authenticated Pocket facade described below.

### Next mutation decision gate

- Do not move a mutation until its target server adapter, authentication, authorization, idempotency, validation, confirmation, error mapping, and rollback/retry behavior are agreed and contract-tested.
- Profile saving was selected as the first adapter because it is authenticated and non-transactional; its idempotency and versioning gates are now implemented and contract-tested.
- The authenticated `GET|POST /api/pocket/profile` adapter is the canonical profile boundary. Profile saves are idempotent upserts: identical retries preserve `updatedAt`, and clients send the current `expectedUpdatedAt` to reject stale edits.
- The legacy `/api/local-currency-profile` response remains compatible while its repository now serializes local-development writes and uses the durable store transaction for atomic production updates.
- `CreateLink.tsx` and `Dashboard.tsx` both use the validated Pocket profile client; the legacy endpoint remains available only for compatibility with older deployments or clients.

### Wallet-link ownership gate hardened

- Payment-purpose writes to `/api/privy-circle-link` now require the existing Circle `userToken`; the server calls Circle `listWallets` and matches wallet ID, address, and blockchain before persisting the link.
- Base, Arbitrum, Arc, and Solana blockchain identifiers are checked against the selected chain, unsupported purposes are rejected, and the Circle token is used only for verification and is never persisted in the link record.
- All existing payment-wallet callers pass the token from their established Circle email-wallet session. The separate Agent Workspace `purpose: agent` path remains on its existing server-managed session boundary and is not part of the Pocket migration.
- Render writes now require PostgreSQL instead of silently using an ephemeral file, local-development mutations are serialized, and identical PostgreSQL upserts no longer advance `updated_at`.
- The hardened legacy boundary remains available for existing UI callers while the Pocket adapter is introduced separately; real signed-in browser verification remains a later production gate.

### Wallet-link Pocket contract gate defined

- `POST /api/pocket/wallets/link` is reserved for payment-purpose `link` and `unlink` mutations; Agent Workspace links are intentionally excluded.
- Both actions require the standard Pocket `Idempotency-Key` envelope. `link` carries the existing Circle `userToken` ownership proof and wallet metadata, while neither the token nor Privy identity fields appear in the response data.
- `expectedUpdatedAt` is an optional millisecond version precondition for safe wallet replacement and deletion. A stale version maps to `VERSION_CONFLICT`; an identical link or repeated deletion returns `unchanged: true`.
- Runtime validators cover request action, supported network, token and wallet bounds, non-negative integer versions, and the sanitized link-result shape.
- Adapter exposure did not silently change callers; the later caller-cutover gate updates the command policy only after payment-purpose UI writes migrate.

### Wallet-link atomic persistence gate implemented

- The shared link store now exposes compare-and-set replacement and deletion primitives without changing the legacy handler transport.
- PostgreSQL mutations take a per-link transaction advisory lock before reading the current row, so concurrent first writes, replacements, and deletions serialize on the authenticated user/network key.
- Local-development compare-and-set mutations reuse the serialized file queue. Production still refuses file fallback when PostgreSQL is unavailable.
- Creating an absent link succeeds without a version. Replacing or deleting an existing link requires its exact `updatedAt`; stale or missing versions raise `VERSION_CONFLICT` at the Pocket adapter boundary.
- Identical link retries preserve the current record and timestamp, while deletion of an already-absent link returns `unchanged: true` even when the retry carries the old version.
- Pure transition tests cover creation, identical retry, missing/stale/correct replacement versions, missing/stale/correct deletion versions, repeated deletion, and stale creation. Source checks preserve lock-before-read ordering for the PostgreSQL path.

### Wallet-link Pocket adapter implemented

- The authenticated `POST /api/pocket/wallets/link` route now exposes payment-purpose `link` and `unlink` over the atomic store primitives; the legacy `/api/privy-circle-link` route remains registered and unchanged.
- Link requests verify the supplied Circle user token against Circle wallet ownership before persistence. Circle-session rejection maps to `FORBIDDEN`, provider outages to retryable `PROVIDER_UNAVAILABLE`, throttling to `RATE_LIMITED`, and stale mutations to `VERSION_CONFLICT`.
- Successful envelopes contain only the normalized network, wallet ID, address, blockchain, timestamp, and `unchanged` flag. Privy identity, verified email, and Circle tokens are not returned.
- Adapter tests cover method, authentication, idempotency, validation, ownership input, response sanitization, identical retries, versioned replacement and deletion, repeated deletion, Circle-session rejection, and provider failure.
- No frontend wallet-link caller moved during the adapter slice itself; the separate caller-cutover below records that transport change explicitly.

### Wallet-link Pocket caller cutover implemented

- `src/pocket/api/pocketWalletLinkClient.ts` owns validated payment-purpose link and unlink mutations, creates the required idempotency keys, sends the Privy bearer token, and parses the sanitized Pocket mutation envelope.
- Payment-purpose writes in `CreateLink.tsx` and `PaymentPage.tsx` now use `/api/pocket/wallets/link`. Their existing Circle sessions still supply ownership tokens; no new login, confirmation copy, or UI state was invented.
- Unlink loads the current Pocket read record first and sends its `updatedAt` precondition. Linked-wallet hydration retains that version, and wallet setup stores the adapter-returned version for later safe mutations.
- Agent Workspace remains on its separate legacy `purpose: agent` read/write boundary and is excluded from the payment-wallet cutover.
- The command manifest now marks `wallet.link` and `wallet.unlink` as idempotent Pocket-adapter operations. Tests prevent payment pages from reintroducing legacy writers while requiring the Agent Workspace legacy boundary to remain explicit.

### Wallet-read Pocket adapter and caller cutover implemented

- Authenticated `GET /api/pocket/wallets` reads the four payment-purpose link keys for the verified Privy user and returns only network, wallet ID, address, blockchain, and `updatedAt`.
- Privy user ID, email, purpose, and Circle session material never appear in the read response. Missing networks are omitted rather than represented by invented wallet records.
- Render reads now fail with retryable `PROVIDER_UNAVAILABLE` when PostgreSQL is not configured instead of silently reporting an empty local store.
- `CreateLink.tsx`, `PaymentPage.tsx`, `TelegramPaymentLinks.tsx`, and `readPocketLinkedWallets` use the validated Pocket read client. Hydration now performs one authenticated request instead of four legacy resolve requests.
- Agent Workspace is the only remaining page caller of legacy `resolvePrivyCircleLink`, where it remains explicitly scoped to `purpose: agent`.
- Adapter and contract tests cover authentication, all supported payment keys, omission of missing links, response sanitization, provider failure, client parsing, bearer transport, single-request hydration, and the payment-versus-agent source boundary.

### Multi-wallet balance Pocket adapter and caller cutover implemented

- Authenticated `GET /api/pocket/balances` derives every queried address from the verified user’s payment-purpose wallet links; the browser cannot submit an address or select another owner.
- The adapter preserves the existing Base, Arbitrum, Arc, and Solana order. Missing links return zero `ok` rows, individual RPC failures return zero `error` rows, and successful balances are summed into the same numeric USDC total.
- EVM and Solana reads reuse the existing server RPC implementations. A failed direct read retains the existing Circle Unified Balance fallback and accepts it only when it returns a positive balance.
- Responses contain network keys, labels, balances, statuses, and safe errors only. Wallet addresses, wallet IDs, Privy identity, email, and Circle session material are not returned.
- `CreateLink.tsx` now supplies only its Privy access token to `readPocketBalances`; wallet state remains page-owned for display and setup, but it is no longer trusted as the balance-query source.
- Adapter tests cover authentication, payment-key derivation, missing-wallet zero rows, per-network failure isolation, total calculation, and response sanitization. Contract tests cover the validated bearer GET client.

### Activity Pocket adapter and caller cutover implemented

- The existing owner-scoped NG-POS history composition is extracted into `listNgPosHistoryForOwner`, so legacy `listHistory` and authenticated `GET /api/pocket/activity` share receipt lookup, Paycrest reconciliation scheduling, deduplication, source labeling, and descending-time behavior.
- The Pocket adapter verifies the Privy user before passing only that user ID into the shared history reader. The browser cannot supply an owner ID, merchant list, event ID, or payment filter.
- The response contains only the activity fields already consumed by Circle Pocket. Merchant summaries, bank-send destinations, owner identity, provider-only fields, and storage records are not exposed.
- `readPocketActivity` now sends a bearer-authenticated GET to `/api/pocket/activity`; it no longer knows the `/api/ng-pos` action protocol.
- Activity presentation still owns its accepted bank-send exclusion and Bank/POS/Bills filters, while `CreateLink.tsx` retains loading, error, refresh, and final descending sort behavior.
- Adapter and contract tests cover authentication, owner propagation, row validation, sanitization, ordering, provider failure, and the GET client boundary.

### POS creation Pocket adapter and caller cutover implemented

- Authenticated `POST /api/pocket/pos` now wraps the existing `createMerchant` domain function; the legacy `/api/ng-pos` action calls that same extracted function and remains compatible.
- The request keeps the existing payout preference, merchant label, network, wallet, and optional verified-bank fields. The browser no longer sends `owner_id` or the legacy action discriminator.
- Privy identity and email matching, deterministic resource IDs, encrypted bank persistence, Paycrest institution resolution, durable-store writes, and action-journal recording remain in the shared NG-POS domain path.
- The required `Idempotency-Key` is preserved end to end. Identical retries return the existing merchant with `replayed: true`; no duplicate terminal is created.
- The Pocket response uses the common mutation envelope and exposes only the existing public merchant projection. Owner identity, bank account number, encrypted bank data, access tokens, and storage records are excluded.
- `CreateLink.tsx` retains the existing signed-in gate, form-submit confirmation, idempotency ref, loading/error state, and ready transition while delegating transport and response validation to `pocketPosClient.ts`.
- Adapter and contract tests cover method, idempotency, request validation, bearer forwarding, replay mapping, response sanitization, auth/provider errors, client parsing, and prevention of legacy POS action calls from the page.

### Bank-receive creation Pocket adapter and caller cutover implemented

- Authenticated `POST /api/pocket/bank-receive` wraps the existing `createBankReceive` domain function; the legacy `/api/ng-pos` action calls the same extracted implementation and remains compatible.
- The existing fixed-or-flexible Naira amount, display label, verified bank fields, saved-bank option, and client origin are preserved. The browser no longer sends `owner_id` or the legacy action discriminator.
- Privy identity and email matching, encrypted bank persistence, deterministic merchant and intent IDs, Paycrest rate lookup with the accepted fallback, minimum payout enforcement, durable-store writes, URL construction, and action-journal recording remain unchanged in the shared domain path.
- The required `Idempotency-Key` is preserved. Repeated requests return the stored public link with `replayed: true` instead of creating another merchant or intent.
- The common Pocket mutation envelope returns only payment/dashboard URLs and the existing public receipt context. Privy identity, access tokens, full account number, bank code, encrypted bank details, and internal storage records are excluded.
- `CreateLink.tsx` retains its existing eligibility gate, form-submit confirmation, idempotency ref, loading/error state, saved-event persistence, and ready transition while delegating transport and response validation to `pocketBankReceiveClient.ts`.
- Adapter and contract tests cover method, idempotency, fixed-amount validation, bearer forwarding, replay mapping, response sanitization, authentication, missing saved-bank and provider errors, client parsing, and prevention of legacy bank-receive action calls from the page.

### Bank metadata and account-verification Pocket adapters implemented

- Public `GET /api/pocket/bank-receive/institutions` exposes the same normalized NGN institution list previously loaded through the legacy `institutions` action. It carries no account or user data and remains unauthenticated behind the read limiter.
- Sensitive `POST /api/pocket/bank-receive/verify` now requires a verified Privy bearer token before forwarding bank code, bank name, and the 10-digit account number to the shared Paycrest verification function.
- The legacy `/api/ng-pos` `institutions` and `verifyAccount` actions remain compatible and call the same extracted provider functions. No institution naming, account-resolution behavior, or Paycrest request was changed.
- Verification responses contain only the resolved account name and canonical bank code. The submitted account number, Privy identity, email, bearer token, and provider payload are not returned.
- `CreateLink.tsx` loads institutions through the public Pocket read client and obtains a current Privy token before account verification. Existing busy, error, verified-account, and bank-code normalization state remains page-owned.
- The command manifest now records `bank.verify` as a bearer-authenticated Pocket adapter without idempotency because it verifies provider metadata and does not persist a mutation.
- Tests enforce public bank-list transport, authenticated verification before provider execution, request validation, response sanitization, provider error mapping, client parsing, and removal of both legacy action names from the page.

### Bank-to-USDC link creation Pocket adapter implemented

- Authenticated `POST /api/pocket/bank-send` wraps the existing `createBankSend` domain path for Circle Pocket users while preserving fixed-or-flexible Naira amounts, Base/Polygon destination selection, EVM destination validation, deterministic link IDs, durable persistence, payment URL construction, and action-journal recording.
- The legacy `/api/ng-pos` action remains compatible with both Privy callers and the existing PolyDesk service token. Service-token access is explicitly enabled only by that legacy branch and uses its dedicated `polydesk-service` owner namespace.
- The Pocket adapter never enables the PolyDesk service-token branch. Calls to `/api/pocket/bank-send` must pass Privy verification inside the shared domain function and cannot claim the service namespace.
- The browser no longer sends `owner_id` or the `createBankSend` discriminator. It retains the existing sign-in gate, profile fields, idempotency ref, fixed/flexible amount, destination network/address, saved-event persistence, errors, and ready transition.
- Repeated `Idempotency-Key` requests return the stored public link with `replayed: true`. The Pocket response excludes owner identity, email, access tokens, service-token state, and internal storage records.
- Adapter and contract tests cover method, idempotency, fixed-amount and destination validation, bearer forwarding, replay mapping, response sanitization, auth/provider errors, client parsing, legacy action removal, and the strict separation between Pocket and PolyDesk service-token namespaces.

### Authenticated Solana withdrawal prepare and submit adapters implemented

- Circle Pocket now uses authenticated `POST /api/pocket/transfers/prepare` and `POST /api/pocket/transfers/submit` for Solana withdrawals. The legacy `/api/solana-build-tx` and `/api/solana-relay` routes remain registered for existing non-Pocket payment flows.
- Prepare accepts only the recipient and USDC amount from the browser. After Privy verification, the server reads the authenticated userâ€™s payment-purpose Solana link and supplies that stored address as the sender to the existing transaction builder; a browser-supplied sender cannot select another wallet.
- The existing builder remains responsible for USDC balance checks, recipient token-account creation, withdrawal fee mode, relayer fee-payer signature, recent blockhash, and last-valid-block-height calculation. Circleâ€™s Solana wallet session still provides the user approval signature in the browser.
- Before submit reaches the existing relay, the Pocket adapter reloads the authenticated linked wallet and validates that the transaction uses the configured relayer as fee payer, all required transaction signatures are cryptographically valid, and the linked Solana wallet is one of the valid signers.
- The signed transaction and block height are bounded and schema-validated. Responses expose only the prepared transaction material or final transaction hash/status; Privy identity, wallet record metadata, tokens, and relayer keys are excluded.
- Solana transaction signatures and blockhash expiry provide the existing replay boundary; no new server idempotency store or invented confirmation step was added. EVM withdrawal remains on the existing Circle wallet-session path.
- Tests cover authenticated wallet derivation, missing-link rejection, browser sender exclusion, legacy builder/relay argument mapping, signed-result parsing, relayer fee-payer enforcement, complete signature verification, linked-wallet signer enforcement, bearer transport, and removal of direct Solana relay calls from `CreateLink.tsx`.

### EVM withdrawal Circle-session boundary formalized

- EVM withdrawals remain client-approved Circle wallet operations rather than being forced through the server transfer relay. `pocketEvmTransferClient.ts` is the Circle Pocket boundary and lazily delegates execution to the existing `sendCircleEvmEmailWithdraw` implementation.
- The boundary accepts only Base, Arbitrum, and Arc Circle EVM sessions, validates the linked and session wallet addresses, requires them to match case-insensitively, validates the destination, and accepts positive USDC amounts with at most six decimals before requesting a Circle challenge.
- The existing Circle implementation remains responsible for authenticated SDK setup, wallet ID/address and chain binding, challenge creation, the accepted Circle confirmation UI, challenge execution, transaction polling, and final transaction hash discovery.
- No Privy token, Circle user token, encryption key, wallet key, or transaction payload is sent to a new Hash PayLink server endpoint. The Circle wallet signature/confirmation remains the sole execution approval and the public PaymentPage withdrawal flow is unchanged.
- The command manifest identifies `withdraw.evm` as a `circle-wallet-client` operation, distinguishing it from Pocket server adapters and from unmigrated legacy page logic.

### Home withdrawal controller extracted

- `src/pocket/controllers/usePocketWithdrawalController.ts` now owns the accepted withdrawal draft, maximum amount action, destination and amount validation, pending/result state, Solana prepare-sign-submit sequence, EVM Circle-session execution, balance refresh, and session activity message.
- The controller preserves the existing six-decimal USDC validation messages, Solana Circle approval memo, linked-wallet session checks, completion notice, and destination reset behavior.
- `CreateLink.tsx` supplies the selected wallet/network and existing session, token, balance-refresh, and activity callbacks; it no longer imports the signing or transfer clients directly.
- The separate PayLink email-recipient unlink action remains outside Home and was not moved or exposed as a new Smart Wallet feature.

### Smart Wallet Home page extracted

- `/pocket/home/smart-wallet` now renders `src/pocket/pages/PocketHomePage.tsx` without mounting `CreateLink.tsx`.
- The page preserves the accepted default Balance/Base state, supported network order, wallet setup and refresh behavior, funding-address copy feedback, profile copy, withdrawal controller, five-item session activity, and shared bottom navigation.
- `PocketRouteShell` now owns the existing mobile visual-viewport keyboard detection, preserving bottom-nav hiding across standalone Home, Bills, and Activity pages.
- `/pocket/home/x402` remains on the transitional `AgentWorkspace` path and was not conflated with Smart Wallet Home.

### Direct USDC PayLink builder extracted

- The x402 versus USDC decision audit rejected a superficial x402 wrapper: its embedded surface remains coupled to the 2,866-line `AgentWorkspace` and its agent profile, OTP, treasury, LP Scout, tip, and legacy transport state.
- `src/pocket/lib/pocketPayLinkBuilder.ts` now owns deterministic PayLink URL construction for network, multi-chain, fixed/flexible amount, EVM/Solana recipient, memo, event, FX, custom-rate, and agent parameters.
- The canonical `/pocket/move/usdc` transitional route calls this Pocket builder; non-Pocket Hash PayLink flows retain their existing builder in this slice.
- URL contract tests cover the accepted single-chain fixed-amount and multi-chain flexible/event/custom-FX/agent combinations. The builder has no browser global, storage, API call, credential, mutation, or signing dependency.

### Direct USDC recipient orchestration extracted

- `src/pocket/hooks/usePocketRecipient.ts` now owns Circle recipient wallet reuse/creation, stale-run cancellation, signed-out intent recovery, payment-purpose unlink with version precondition, public balance preview, unsupported-network fallback, and accepted recipient error messages.
- The existing `CircleReceiveSelector` presentation consumes the hook snapshot and actions without changing its Privy controls, labels, bank slot, or address presentation.
- `CreateLink.tsx` no longer imports recipient balance or wallet read/unlink clients directly. Transaction signing and withdrawal responsibilities remain separate from this receiving-only hook.
- The auto-connect effect preserves the legacy retry boundary: pending/error state changes do not silently restart a cancelled or failed wallet request.
- Tests inject the Circle executor and cover exact forwarding, session-to-linked-wallet matching, recipient and six-decimal amount validation, prevention of execution after validation failure, source ownership by the Pocket client, and absence of an invented server transport.

### Direct USDC standalone page extracted

- `/pocket/move/usdc` now renders `src/pocket/pages/PocketMoveUsdcPage.tsx` without mounting `CreateLink.tsx`.
- `usePocketUsdcDraftController` owns the accepted address, amount, memo, flexible and multi-chain draft, deterministic result, copy/share state, QR refs/download, dashboard URL, and direct-USDC reset behavior.
- Pure validation preserves the existing input normalizer, EVM/Solana checks, positive amount rule, flexible-amount exception, multi-chain address rule, and exact missing-address guidance.
- The page preserves connected-wallet autofill/disconnect, single-chain network-change clearing, Circle Pocket recipient connection and sign-in intent, existing fields/panels, bottom navigation, and accepted share/QR behavior.
- No PayLink server mutation, bank/POS transport, signing flow, or transfer execution was added. x402, Bank, POS, and Assistant remain separate transitional routes.

### Bank receive standalone page extracted

- `/pocket/move/bank` now renders `src/pocket/pages/PocketMoveBankPage.tsx` without mounting `CreateLink.tsx`.
- `usePocketBankReceiveController` owns the accepted Nigeria bank selection, public institution load, authenticated account verification, NGN amount and memo draft, flexible amount, retry-stable idempotency key, authenticated link creation, result/share state, QR download, and reset behavior.
- The page preserves the existing payout profile, account-name comparison, Base-only payer notice, sign-in gate, form and result components, and shared bottom navigation.
- Bank discovery, verification, profile read/write, and link creation continue through their existing Pocket adapters. No direct legacy route, POS mutation, bank-send flow, wallet signing, or transfer execution was added.
- x402, POS, and Assistant remain separate transitional routes.

### POS standalone page extracted

- `/pocket/move/pos` now renders `src/pocket/pages/PocketMovePosPage.tsx` without mounting `CreateLink.tsx`.
- `usePocketPosPageController` owns the accepted country, setup, and ready state; `posStep` history synchronization; merchant and verified-bank drafts; public bank discovery; authenticated verification; retry-stable creation; static payer/dashboard URLs; and copy feedback.
- The standalone route remains the source-faithful Nigeria instant-bank-payout flow on Base. The unused crypto-wallet POS branch from the larger Hash PayLink page was not introduced into Pocket.
- The page preserves the payout-profile gate, exact country/setup/ready panels, sign-in card, shared route shell, and bottom navigation.
- POS creation continues through `pocketPosClient`; bank discovery and verification continue through `pocketBankClient`. No direct legacy route, PayLink mutation, wallet signing, or transfer execution was added.
- x402 and Assistant are the only remaining transitional Pocket routes.

### Authenticated x402 read facade implemented

- `GET /api/pocket/x402` is the first bounded x402 migration slice. It verifies the Privy bearer token and derives the existing stable wallet namespace from the verified email on the server; callers cannot provide or inspect an agent slug.
- The facade permits only Base or Arc and returns a sanitized wallet address, connection state, wallet USDC balance state, Gateway USDC balance state, and update timestamp. It excludes activity, identity, email, session IDs, storage records, Circle command output, and internal provider errors.
- `readAgentWalletSnapshot` reuses the established wallet store, direct USDC reader, Circle session, and Gateway balance commands without changing the legacy `/api/agent-wallet` response or callers.
- `pocketX402Client.ts` supplies the Pocket-owned authenticated read transport and validates the response contract before returning it to a future standalone page.
- No connection, OTP, Gateway activation/deposit, x402 service payment, receipt mutation, or UI route was moved in this slice. Those money-moving/session mutations require separate command policies, approval boundaries, and replay handling before the transitional `AgentWorkspace` can be removed.

### Authenticated x402 wallet connection facade implemented

- `POST /api/pocket/x402/connect` preserves the existing Circle agent-wallet login primitive for both wallet creation and existing-wallet linking. `init` sends or resends the Circle OTP; `complete` verifies the newest OTP and binds the selected wallet session.
- Privy authentication is mandatory. The server derives the normalized email and stable wallet namespace from the verified identity, and rejects browser-supplied `email` or `agentSlug` fields.
- Base and Arc are the only accepted connection networks. Optional expected-wallet selection is EVM-address validated; multiple-wallet responses are limited to eight valid addresses with numeric balance strings or a generic unavailable label.
- The response excludes the verified identity, email, agent slug, Circle request/session IDs, pending-store records, CLI output, filesystem details, and raw provider errors.
- `x402.wallet.connect.init` and `x402.wallet.connect.complete` are explicit Privy-authenticated identity-write command policies. They intentionally have no generic idempotency header because Circle OTP resend replaces the previous code and completion is bound to Circle's one-time request.
- Gateway activation, deposits, service payment, disconnect, receipts, and the x402 UI remain unmoved. Gateway activation is the next separate financial-write boundary.

### Replay-protected x402 Gateway activation facade implemented

- `POST /api/pocket/x402/activate` is the explicit financial-write boundary for moving wallet USDC into Circle Gateway on Base or Arc. Base preserves the existing `eco` deposit method; Arc Testnet preserves `direct`.
- The request requires Privy bearer authentication and a valid Pocket idempotency key. The server derives the wallet namespace from the verified email and resolves the already-connected Circle session; the browser cannot provide identity, wallet address, Circle session, deposit chain, or deposit method.
- Accepted amounts are exact decimal strings from 0.5 through 5 USDC with at most six decimals. Oversized values are rejected instead of inheriting the legacy handler's silent clamp.
- The action journal now supports an atomic durable-store claim with a serialized file fallback. The claim occurs before the Circle command. Concurrent or repeated claims cannot execute the provider call twice; reuse with a different amount or network is rejected.
- Completed and provider-pending results are replayable from sanitized journal metadata. A started or failed record is never automatically reissued because the provider may have accepted the deposit before a response or verification failure; the user must check Gateway balance before starting a new keyed attempt.
- Responses expose only request/idempotency state, activation availability, exact amount, network, wallet address, and Gateway balance. Circle CLI output, filesystem paths, session IDs, identity, email, and raw provider errors are excluded.
- `x402.gateway.activate` is a Privy-authenticated, required-idempotency, form-approved financial-write command policy. LP Scout/service purchases, receipt extraction, disconnect, and the standalone x402 UI remain separate.

### Standalone x402 page extracted

- `/pocket/home/x402` now renders `PocketX402Page` directly from `CirclePocketApp` without mounting `CreateLink` or `AgentWorkspace`.
- `usePocketX402Controller` owns Base/Arc selection, authenticated snapshot refresh, create/link choice, OTP network binding, resend and newest-code completion, expected-wallet selection, connection errors, activation draft, stable idempotency key, provider-pending state, and post-action refresh.
- The page preserves the accepted x402 service-balance hero, Circle Gateway/connection badges, balance-network selector, Privy sign-in, Circle create/link and OTP panels, wallet and service balances, funding action, and activation panel.
- The funding URL preserves the existing flexible agent-funding PayLink fields and now returns to `/pocket/home/x402`; it does not expose the server-derived wallet namespace.
- Activation validation matches the verified server boundary: exact 0.5–5 USDC, six decimals, and no amount above the currently known wallet balance. A pending provider result is presented as pending rather than falsely claiming availability.
- LP Scout/service purchases, tips, receipts, disconnect, agent profiles, StreamPay, and unrelated AgentWorkspace state were deliberately excluded. The page and controller know only the Pocket x402 clients and shared presentation/authentication utilities.
- At this checkpoint, Assistant was the only Pocket route that still fell through to `CreateLink`; the later standalone-shell boundary completed that extraction.

### Standalone dependency audit completed

- `docs/circle-pocket-standalone-dependency-audit.md` records the actual remaining frontend and API boundaries after the adapter cutovers.
- At this checkpoint, the Pocket route still mounted `CreateLink.tsx`, and Pocket business state plus the locked assistant remained coupled to Hash PayLink page modules.
- At this checkpoint, `Layout.tsx` still mirrored canonical Pocket routes through local state and custom `hashpaylink-circle-pocket-*` events; the later standalone-shell boundary removed that bridge.
- The recipient Solana balance preview still knows the legacy `/api/solana-balance` transport, and the planned session, PayLink, Bills, and Pocket-agent facade contracts are not implemented.
- Shared authentication bootstrap, chain metadata, formatting utilities, Circle signing helpers, server domain functions behind Pocket adapters, and public PayLink/receipt origins remain intentional shared infrastructure for the in-repository migration.
- The next clean implementation slice is route-derived Pocket layout state and removal of the Pocket navigation event bridge before extracting the final application shell from `CreateLink.tsx`.

### Pocket layout route ownership implemented

- For `/pocket/*`, `Layout.tsx` resolves the canonical Pocket route and derives the header mode plus active wallet, Move, Bills, or Activity selection directly from the URL.
- Pocket header selections now navigate with React Router and `pocketPathFor`, so refresh, Back, and Forward no longer require a selector event to reconstruct the header.
- At this checkpoint, the old `hashpaylink-circle-pocket-*` state and events remained for the embedded Hash PayLink compatibility surface; the later standalone-shell boundary removed them.
- Wallet creation, balance reads, Circle signing, financial mutations, and accepted presentation remain unchanged.
- Contract checks require the route resolver and all four direct Pocket header navigation branches. The next boundary is extracting the Pocket application shell from `CreateLink.tsx`, beginning with identity and wallet-read orchestration.

### Pocket identity and account-read hooks extracted

- `src/pocket/hooks/usePocketIdentity.ts` owns Privy authentication state and normalized email extraction without adding a second identity or session mechanism.
- `src/pocket/hooks/usePocketWallets.ts` owns authenticated payment-wallet hydration, signed-out snapshot clearing, balance refresh state, total/row state, and safe cancellation during identity changes.
- `src/pocket/hooks/usePocketActivity.ts` owns authenticated activity loading, descending timestamp ordering, busy/error state, signed-out clearing, and route-surface refresh timing.
- `CreateLink.tsx` consumes these Pocket-owned hooks and no longer directly imports Privy, linked-wallet hydration, multi-wallet balance reads, or activity reads.
- Existing wallet creation, Circle EVM/Solana sessions, wallet-link writes, confirmations, signing, withdrawal execution, and all other financial mutations remain unchanged in the page for this slice.
- Contract checks prevent the read hooks from acquiring wallet-link, signing, transfer, or legacy NG-POS transports. The next boundary is a Pocket-owned wallet creation/session controller.

### Pocket wallet creation and session controller extracted

- `src/pocket/controllers/usePocketWalletController.ts` now single-sources authenticated existing-wallet reuse, supported-network checks, Circle EVM/Solana email-wallet connection, ownership-token link creation, returned link-version mapping, and cached session reuse.
- The receive selector preserves its original network/email run key through a controller cancellation callback, so a stale Circle verification cannot link or display a wallet after the user changes intent.
- The main Pocket wallet setup flow commits controller results into the Pocket-owned wallet snapshot and keeps the accepted busy, error, balance-refresh, and activity-notice behavior.
- Withdrawal session lookup now uses the controller's address/chain-bound cache. Solana signing and authenticated prepare/submit plus EVM challenge execution remain page-owned and unchanged.
- `CreateLink.tsx` no longer imports or calls Circle connection functions or `linkPocketWallet` directly. Its remaining wallet mutation is the existing explicit disconnect/unlink flow.
- Contract checks require read-before-create, stale-run cancellation, Circle ownership-token forwarding, link-version mapping, session address matching, and absence of signing or transfer transports in the controller.

### Pocket profile orchestration extracted

- `src/pocket/hooks/usePocketProfile.ts` owns authenticated payout-profile loading, signed-out clearing, draft/edit/cancel state, busy/error state, and cancellation of stale loads when identity changes.
- Profile saves continue through the existing authenticated Pocket profile adapter, force the verified identity email, and send the stored `updatedAt` as the optimistic-concurrency precondition.
- `CreateLink.tsx` consumes the Pocket-owned profile snapshot and actions; it no longer imports or calls profile read/save transports directly.
- Bank verification, POS creation, bank receive/send creation, signing, withdrawals, and all other financial mutation lanes remain unchanged.
- Contract checks require the Pocket profile transports and version precondition while preventing the hook from acquiring bank, POS, wallet-link, signing, or transfer responsibilities.
- The next facade cleanup is the recipient Solana balance preview that still knows the legacy `/api/solana-balance` route.

### Recipient Solana balance Pocket facade implemented

- Public read-limited `POST /api/pocket/balances/recipient` now owns the Circle Pocket recipient Solana USDC preview transport.
- The request accepts only `{ network: 'solana', address }`, bounds and validates the address, and reuses the existing server-side Solana USDC reader and configured RPC fallback.
- The response exposes only the network and raw six-decimal balance string. ATA, RPC details, identity, linked-wallet metadata, and provider errors are not returned.
- `readPocketRecipientBalance` now uses `POCKET_API.recipientBalance`; the Pocket frontend no longer knows `/api/solana-balance` or its `accountAddress` body.
- The existing legacy endpoint remains registered for non-Pocket compatibility. Browser-side EVM recipient previews retain their existing public `balanceOf` reads.
- Adapter tests cover method, network, address validation, exact reader forwarding, response sanitization, and provider failure; client contracts preserve the existing numeric six-decimal conversion.

### Standalone shell boundary completed

- `/pocket/*` mounts `CirclePocketApp`, and every Pocket route now renders a Pocket-owned page without mounting `CreateLink`, `TelegramHelperPanel`, or `AgentWorkspace`.
- `CreateLink.tsx` no longer contains the embedded Circle Pocket shell, its wallet/activity/withdrawal orchestration, or its Pocket navigation event listeners. Shared Hash PayLink receive, bank, POS, recipient, and PayLink components remain available to their existing non-Pocket flows.
- `Layout.tsx` derives Pocket header state only from the canonical route. Header selections navigate directly through `pocketPathFor`; the embedded Circle Pocket state, surface/view listeners, and selector dispatch events have been removed.
- Contract coverage recursively scans the complete `src/pocket` TypeScript tree for forbidden legacy page dependencies, verifies the standalone Assistant mount, and prevents the embedded layout bridge from returning.

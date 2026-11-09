# Marketplace access and admin release - 2026-11-09

Developers can request Marketplace Payments access from their app Payments tab using the verified email linked to their signed-in account. Requests persist as pending and cannot grant themselves access. Authorized founder admins review, approve, reject or revoke requests under Marketplace. Decisions use optimistic concurrency and record reviewer, timestamp and note.

The admin overview and Apps by product view separate Checkout, Polymarket Funding and Marketplace. Approved marketplace requests appear in Marketplace without changing production capabilities. Multi-product apps appear in each applicable section. Scope and current app ownership constrain summary metadata.

Validation: full TypeScript check passed after restoring the scanner review state variables; focused diagnostics, source build, marketplace smoke suites and responsive portal/admin browser fixtures were run. Browser fixtures cover request/reload, approval/revocation, product grouping, hidden workspaces and widths 320, 390 and 1280. They do not prove a live signed-in request or money movement.

Additional audit fixes in this release: unsubmitted payout reservations can be cancelled with provenance restored and stale claims fenced; submitted transfers cannot be cancelled this way. Base deployed smart-contract beneficiary signatures can be checked through ERC-1271 with an injected chain client. Scanner fixtures were repaired to exercise the existing child-owned back action.

## Production boundary

The live baseline before release was d8a367dbd44f65a0147922aa88e0a7c9de5e6538 on Render service srv-d7ilg0osfn5c73eaedf0. Existing Circle, Paycrest and database credentials were present, but dedicated marketplace runtime configuration and activation adapters were absent. No credentials are recorded here.

This release enables access requests and administrative review only. Marketplace financial routes and workers remain inactive. Approval is rollout eligibility, not an automatic production payment capability grant.

Remaining financial activation work includes authoritative collection/funding verification, production project authentication, dedicated holding wallet policy, wallet and bank execution wiring, refund proof verification, real-database concurrency validation, and an end-to-end live payment/release/refund pilot. Existing fixture passes must not be represented as live settlement evidence.

## Next dependency: developer instruction authentication

The internal instruction service now defaults to the durable developer API-key adapter in `api/marketplace/authorization.ts`. It reuses the portal HMAC digest format and re-reads project/key and whitelist state for every request. It requires all of:

- `MARKETPLACE_INSTRUCTIONS_ENABLED=true` and explicit `MARKETPLACE_PROJECT_IDS` rollout inclusion.
- An active business app with approved business verification and the Marketplace capability configured.
- Exactly one approved whitelist request belonging to the current app owner.
- A matching, unrevoked, unexpired general live API key; scoped app/CLI/test keys are denied.

General live keys carry the app's read, release, payout and refund authority. No new key issuance or scope-grant UI is exposed. Missing or ambiguous records fail closed. A storage failure propagates and cannot authorize a command. The existing instruction gate also stays disabled by default.

Validation: authorization smoke tests cover digest matching, configuration gates, owner transfer, suspended/removed apps, verification, key expiry/revocation, request rejection/revocation, duplicate records, storage failure, and denial before repository access. Existing instruction regressions and focused TypeScript checks pass. These are local fixtures, not live provider or database concurrency evidence.

This closes the credential-resolution implementation gap only. No public financial endpoints, production configuration, holding wallets or funds were changed. Workers must still recheck custody/fee authority immediately before submission; the refund runtime's execution-authority adapter remains a separate blocker. Collection verification and live settlement remain outstanding.

## Collection verification dependency

`api/marketplace/collections.ts` verifies Base USDC collection receipts through an injected Base RPC client and an authoritative checkout-session resolver. Callers provide only project/payment references; the transaction hash, payer identity, payer wallet, amount and holding revision come from the trusted session adapter. The verifier does not expose a manual deposit address or accept arbitrary transaction claims.

A credit requires a successful matching receipt, canonical block at or below the finalized head, transfer time within the session lifetime, exactly one USDC transfer into the isolated holding address from the bound payer for the exact plan amount, and no USDC outflow from that holding address in the same transaction. The session is re-read before commit and the plan is compared inside the atomic mutation. A canonical chain/transaction/log identity and the original-payer refund binding are persisted together with pending balances.

The configured repository rejects generic funding commands. Verified retries are idempotent; transaction/session reuse across projects is rejected under the same durable mutation. Refund reservations can resolve the saved original-payer binding from the collection proof. No balance is automatically released or paid out.

Tests cover invalid, wrong-chain, wrong-token, wrong-amount, wrong-recipient, reverted, unfinalized, noncanonical, removed-log and ambiguous evidence; session/plan mutation; RPC failure; concurrent replay; cross-project race; holding isolation; and refund destination binding. Focused collection/repository TypeScript checks pass. All evidence here is synthetic.

Still required before live use: connect the authoritative Circle checkout-session store to this resolver, configure and verify a dedicated holding wallet, bind collection routing before the buyer signs, and run a real end-to-end pilot. This code remains unmounted; no live addresses, wallets, environment flags or financial flows were changed.

## Hosted checkout adapter and holding-wallet composition

`checkout-collections.ts` now uses `readVerifiedHostedCheckoutRecord` by default. An internal caller must bind an unpaid, fixed, live Base USDC checkout to its marketplace order before exposing the checkout URL. The recipient must already be the configured holding address. This adapter never rewrites a merchant checkout recipient or converts a paid checkout into escrow.

The durable binding records checkout integrity, exact amount, order/project, holding identity/revision and lifetime. It rejects local-settlement, cash-balance collection, provider-funding, flexible, agentic, multi-network, and merchant-fee deduction paths. Current server-recorded payer/transaction evidence is then independently checked by the finalized on-chain verifier. The payer identifier is explicitly wallet-scoped; it is not presented as a verified Circle or Privy user ID.

`createMarketplaceCollectionRuntime` composes the durable store, authoritative checkout adapter, collection verifier, and Circle `verifyConfiguredWallet`. The Circle check validates the configured wallet ID, wallet set, address, Base chain, account type and live state. It does not create a wallet or send a transaction. Collections require their own `MARKETPLACE_COLLECTIONS_ENABLED=true` flag; enabling them does not require enabling the refund worker. Explicit Marketplace credentials and holding configuration are still mandatory, with no fallback to Bills credentials or wallet identity.

At 2026-11-09T16:07:29Z, read-only production inspection confirmed the live portal/admin revision was 672ee03fc and Marketplace configuration was still missing. No environment variables or wallets were changed. The adapter/runtime are internal and unmounted; the public checkout-creation flow still needs a Marketplace-specific creation hook that binds the checkout before returning its URL. Dedicated holding-wallet provisioning and verification, execution authorization, and a controlled live pilot remain outstanding.

Validation uses mocked provider/checkout reads and real ledger transitions, covering pre-payment binding, duplicate binding, exact routing, changed records, expiry/reconciliation, holding verification failures, disabled configuration and original-wallet refund resolution. No live settlement is claimed.

## Authenticated checkout creation

Marketplace instructions now include a `marketplace:create` permission and strict `createCheckout` request containing only `paymentId`, `title` and `returnUrl`. General approved live keys receive this permission alongside the existing Marketplace permissions. Project identity comes from authentication. The runtime reads the existing marketplace plan for the exact Base USDC amount and the developer record for merchant name and allowlisted return origins; the configured holding wallet supplies routing.

`createBoundMarketplaceHostedCheckout` reuses hosted-checkout signing, fixed-payment attempts, capacity limits, execution tracking and the webhook outbox. Creation uses a deterministic project/order identity and a request fingerprint. Binding must succeed before execution publication, the creation webhook, or returning the payment link. A failure leaves a private, retryable draft; a retry uses the same checkout. Conflicting requests and expired unpaid drafts fail rather than silently creating a second payable link. Creation notifications include `product: marketplace_payments` and `paymentId`.

The internal collection runtime verifies the Circle holding wallet before creation and binds the checkout through the existing verified-record adapter. No payer-facing manual-deposit route is introduced. No public Marketplace endpoint is mounted and no production gate or wallet configuration has been changed.

Validation covers request scope/project isolation, routing-field injection, non-allowlisted return URLs, binding failure before notification or link publication, concurrent/retried creation, immutable request conflicts, expiry and revoked access, plus existing hosted-checkout regressions. Tests remain synthetic; dedicated production holding configuration and a live collection/release/refund pilot are still required.

## Dedicated provisioning and backing checks

`api/marketplace/provisioning.ts` now provisions a dedicated Base SCA wallet set and wallet through the existing Circle client with explicit Marketplace labels. Bills remains the default client purpose. Provisioning requires Marketplace-specific credentials, a holding identity/revision, an explicit mainnet setup flag, and Bills wallet/set/address identifiers for separation checks. The Marketplace set, wallet ID and address must differ from Bills.

The durable provisioning journal is written before provider calls. Both UUID v4 creation keys are retained across timeouts and restarts; retries never generate replacements. Configuration changes require recovery review. Created wallets are read back and validated before a non-secret configuration proposal is returned. The workflow does not write environment variables, enable workers, move money, or establish separate signing permissions merely by creating a new wallet set.

Commands (run from the release checkout with authorized server credentials configured):

- `node --import tsx scripts/marketplace-holding-setup.mjs status` checks setup configuration without provider writes.
- `node --import tsx scripts/marketplace-holding-setup.mjs provision` creates/retrieves the journaled wallet set and wallet, then returns proposed Marketplace identifiers. Requires `MARKETPLACE_PROVISIONING_ENABLED=true` and `MARKETPLACE_ENVIRONMENT=base-mainnet`; do not generate new keys or delete the journal after an ambiguous result.
- `node --import tsx scripts/marketplace-backing-audit.mjs` verifies the configured Circle wallet and compares finalized Base USDC against ledger obligations. Requires `MARKETPLACE_BASE_RPC_URL` and the dedicated holding configuration. This is read-only.

Backing counts pending, available and reserved amounts across the holding's ledger books, checks conservation, and fails closed on missing origin proofs, other holding revisions, unresolved sends, insufficient USDC, changing chain/ledger snapshots, or missing storage. It is a point-in-time check, not a transactional spending reservation. Fee coverage and submission authorization remain required. The refund runtime now requires a backing-check adapter and runs it before authorizing submission; wallet/bank executors still need their production preflight adapters wired to the same backing policy.

Validation: mock provider tests exercise timeout/restart/concurrent provisioning, key persistence, separate identities, read-back mismatch and configuration conflicts. Backing fixtures cover shortages, unsettled sends, stale revisions, corrupt accounting and snapshot races. Existing Bills client tests verify unchanged default behavior and new Marketplace request metadata. The local status command reported missing dedicated setup configuration. No real Circle provisioning request, production environment change or live solvency claim was made.

The Circle create-wallet API specifies UUID v4 idempotency keys and fresh entity-secret ciphertext: https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/create-wallet . Holding-wallet migration and least-privilege signing policy remain open audit items.


## Individual private-pilot eligibility and registration correction

The product picker and create/update API now distinguish registration from open payment products. Marketplace can be selected alone for app registration; it remains excluded from ordinary production capabilities. The Products panel directs applicants to whitelist review. Selecting the product does not submit a request or grant payment authority.

The Marketplace principal resolver accepts an individual with current Basic or Advanced production KYC, read from the existing owner-bound Pocket verification store. It does not trust the cached personalKycVerified project flag. Businesses still require approved business verification. Both require the explicit project rollout, active app, Marketplace capability, unambiguous current-owner whitelist approval and a valid general live key. Rejected or changes-requested business reviews deny access.

An internal execution-authority resolver rechecks the persisted reservation's project and credential ID against fresh project, whitelist and KYC state. It is not a public authentication endpoint. The refund runtime now requires this check in addition to backing and custody/fee authorization. Ordinary key revocation, expiry, owner transfer, app suspension, whitelist revocation or KYC failure block new submissions. Existing uncertain transfers still require reconciliation rather than another send. Wallet/bank production adapters remain outstanding.

Read-only production check: Multivendor (dev_a48cb83ccc2848a68a) has approved whitelist status, individual account type, no qualifying individual KYC, only hosted_checkout selected, and no rollout inclusion. Collection and instruction flags remain false. No live eligibility, credentials, funding or account type were changed.

Local checks: selectable Marketplace browser regression, product policy, Marketplace principal/worker authority, runtime readiness and focused TypeScript. These are fixture checks, not a funded pilot. Changes in this section have not been deployed. Live testing is blocked by owner verification, remaining execution integration, verified gas coverage and end-to-end settlement evidence.


## Registration and individual eligibility release verified

Deployed commit 3ba6510839366c53231669fafd02e787bde07dbe through Render deployment dep-dbp1cchsrm7s73aql290; Render reported live. The source production build passed. The served developer portal bundles contain the new selectable Marketplace registration copy and individual eligibility documentation. The developer portal and main /api/health both returned HTTP 200. The asset verification follows dynamically imported DeveloperApp, DeveloperPortalPage and DocsApp chunks; it does not claim an authenticated live creation test.

A fixture API check also created an individual Marketplace-only app successfully and confirmed that enabledCapabilities remained empty. Existing browser selection, authorization, refund-execution, runtime and focused TypeScript checks passed before release.

After deployment, the Multivendor whitelist remained approved, its account remained individual, its configured capability remained hosted_checkout, and production KYC was still none. It was not added to rollout, and collection/instruction flags remained false. Developer action: complete Personal verification (Basic), then select Marketplace in app settings and save. No funds were moved. Remaining financial activation blockers are unchanged.


## Base USDC Circle wallet payout adapter

Added internal wallet-custody.ts and createMarketplaceWalletRuntime. The runtime uses the dedicated Marketplace Circle configuration and existing durable ledger. It requires MARKETPLACE_WALLET_WORKER_ENABLED=true, instruction enablement, project rollout, a Base RPC client, current execution authority and an explicit provider gas-coverage adapter. Backing uses the shared finalized Base USDC obligation check. There is no default gas sponsorship claim, public route or automatic scheduler.

Submission uses the existing exclusive claim and submission deadline. The attempt UUID becomes the Circle idempotency key, and a deterministic reference plus holding wallet ID is persisted before the provider call. Retries after an uncertain submission only query the existing reference/transaction. No matching transaction is not evidence that a resend is safe. The provider transaction ID, wallet, reference, source, destination, amount and immutable hash are checked. Recovery is read-only and can continue after credential revocation.

Settlement requires a canonical finalized Base receipt with one exact Base USDC outflow from the configured holding to the verified seller wallet, with no additional USDC outflow. Provider success alone never credits paid balances. Reverted funding restores availability only after a finalized revert and terminal provider failure. The reconciliation transaction creates one ledger result and one outbox event. Concurrent observations may have different observation timestamps; identical financial evidence remains idempotent without accepting changed amounts, destinations or receipt identity.

Validation: new Circle wallet custody fixture covers disabled flags, holding isolation, missing rollout, authority/backing/gas denial, exact decimal formatting, pre-send journal, concurrent claims, provider timeout and restart, empty lookup, no blind resend, provider ID/destination mismatch, wrong chain, reorg, provisional blocks, removed logs, extra outflows, finalized settlement, terminal revert restoration and one outbox event. Existing wallet coordinator/reconciliation and runtime suites pass; focused TypeScript passes. All provider and chain behavior is simulated. No live transfer, gas-policy activation, developer permission change or deployment was performed for this adapter.

Remaining: verified production gas coverage, NGN Paycrest quote/funding/settlement adapter composition, production worker scheduling, and a controlled funded full-lifecycle pilot. The developer's unfinished KYC does not block this implementation work; it continues to block granting that developer live execution access.


The internal wallet runtime also exposes a bounded drain (1-20 tasks) with a durable per-project cursor. It skips final/cancelled operations, advances before provider I/O, recovers uncertain attempts without resending, and drains the existing webhook outbox independently of blocked payouts. Worker fixtures cover restart fairness, project isolation, terminal exclusion and sanitized errors. No scheduler or production flag was enabled.

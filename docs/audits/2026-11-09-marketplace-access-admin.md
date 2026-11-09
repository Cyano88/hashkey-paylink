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

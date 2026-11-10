# Marketplace Base USDC API and operations

This implementation is gated, not generally available. Whitelist approval alone does not activate it. The remaining live acceptance checks are recorded in the production-readiness audit. All routes below are relative to `/api/marketplace/v1` and require `Authorization: Bearer <live project key>`. Sandbox keys are rejected. Project scope comes exclusively from the credential; never send `projectId` or a path payment ID in the body. Responses are `{ok:true,data:...}` or `{ok:false,error:...}`. Disabled service returns 503, invalid credentials 401/403, invalid input 400, reference conflicts 409. On timeout/503, read status and reuse the original idempotency key.

## Narrow integration contract

Only USDC on Base with verified wallet settlement is exposed. Amounts are decimal strings with at most six decimal places; `*Units` fields are integer micro-USDC strings. Do not use floating point arithmetic. All listed body fields are required; extra fields are rejected. Mutation routes marked **key** require `Idempotency-Key`, scoped to the project/payment. References use alphanumeric characters, colon, underscore, period or hyphen, start alphanumeric, and are 2–160 characters long.

| Method and path | Body / behavior |
| --- | --- |
| POST `/wallet-beneficiaries/challenges` | `sellerId, beneficiaryId, address`; returns wallet ownership challenge. The wallet signs the exact returned message. |
| POST `/wallet-beneficiaries/:beneficiaryId/verify` | `nonce, signature`; validates EOA or supported contract-wallet ownership on Base. |
| DELETE `/wallet-beneficiaries/:beneficiaryId` | Revokes destination for future execution. |
| POST `/payments` **key** | `paymentId, amount, allocations`; each allocation has `id, sellerId, role, amount, beneficiaryId`. Role is `seller` or `platform`; allocation amounts must sum exactly to total. |
| GET `/payments/:paymentId` | Collection status, allocation balances and operation states. |
| POST `/payments/:paymentId/checkout` | `title, returnUrl`; bound hosted checkout is idempotent per payment and immutable presentation. A return URL is never proof of payment. |
| POST `/payments/:paymentId/releases` **key** | `businessReference, releases`; each release has `allocationId, amount`. Requires finalized collection. |
| POST `/payments/:paymentId/payout-quotes` | `operationId, allocationId, amount`; amount is gross withdrawal. Returns fixed expiring quote with exact fee and recipient amount. |
| POST `/payments/:paymentId/payouts` **key** | `quoteId, businessReference`; reserves the accepted quote, not a claim of settlement. |
| POST `/payments/:paymentId/refund-fees` **key** | `allocationId, amount`; transfers released platform commission into that project's refund-fee balance. Seller funds cannot supply it. |
| POST `/payments/:paymentId/refunds` **key** | `refundId, allocations, businessReference`; each allocation has `allocationId, amount`. Refund destination is the verified original payer; no arbitrary address accepted. |
| POST `/payments/:paymentId/payouts/:operationId/cancel` **key** | `businessReference`; only safely cancellable, unsubmitted reservations are restored. Unknown or submitted operations require reconciliation. |
| GET `/payments/:paymentId/payouts/:operationId/receipt` | Exact settled payout details and fees. |
| GET `/sellers/:sellerId/balance` | Project-scoped seller balances. |
| GET `/refund-fees` | Project-scoped refund-fee balance. |

The withdrawing party pays the disclosed withdrawal fee. The buyer receives approved refund principal intact; refund gas is separately charged to the marketplace's funded fee balance. Receipt emails are optional and currently limited to verified linked Pocket recipients. External marketplaces should use authenticated status and signed webhooks to provide their own customer notifications. There is no developer-email fallback and no daily developer summary yet.

## Runtime gates and gas coverage

The server mounts the routes and schedules a bounded tick every 30 seconds. Existing durable execution claims, cursors, provider identifiers and reconciliation preserve restart safety. Separate switches control instructions, collections, wallet execution, refund execution, webhook delivery and read-only monitoring:

`MARKETPLACE_INSTRUCTIONS_ENABLED`, `MARKETPLACE_COLLECTIONS_ENABLED`, `MARKETPLACE_WALLET_WORKER_ENABLED`, `MARKETPLACE_REFUND_WORKER_ENABLED`, `MARKETPLACE_WEBHOOK_WORKER_ENABLED`, `MARKETPLACE_MONITOR_ENABLED`.

Retain the existing dedicated holding-wallet configuration and project allowlist. Explicit `MARKETPLACE_MAX_NETWORK_FEE_UNITS` and `MARKETPLACE_PROVIDER_SURCHARGE_BPS` are mandatory for quote/execution configuration; there is no permissive default. Turning off instructions stops new instructions/submissions; keep reconciliation workers available for already submitted operations. Do not switch off reconciliation to resolve an unknown result.

Before submission, execution requires a current operator-reviewed durable gas-coverage record under `hashpaylink:marketplace-gas-coverage:v1`: `id, holdingId, holdingRevision, walletId, holdingAddress, paymaster, projectIds, maximumFeeUnits, providerPolicyConfirmed:true, approvedBy, verifiedAt, expiresAt, proofTransactionHash`. See `gas-coverage.ts` for exact validation. TTL is at most 24 hours. The proof must be a successful finalized canonical Base transaction with a successful UserOperationEvent emitted by a recognized EntryPoint, for this holding wallet and paymaster. This evidence does not itself establish provider policy: the operator must separately verify the actual provider sponsorship policy and bounds. Never promote a historical pilot proof into unlimited approval. Missing, expired or mismatched coverage defers submission. No coverage record has been provisioned by the implementation tests.

## Monitoring and recovery

Founder-authenticated GET `/api/marketplace-operations` returns current unknown-operation, expired-quote and webhook backlog counts, last worker health, backing result, and up to 100 undelivered events. Durable health is `hashpaylink:marketplace-worker-health:v1`; backing is `hashpaylink:marketplace-backing-monitor:v1`. A monitor-enabled tick checks backing at most once a minute. Alert on a health timestamp older than two minutes, backing shortfall/unavailability, unknown operations, dead webhook events, expired reserved quotes and a growing backlog. The server emits sanitized `[marketplace-health]` warnings; external alert routing and an accountable on-call owner must be configured and verified before unattended activation.

On provider outage or unknown transaction outcome, leave reservations intact, inspect the recorded provider transaction identifier and canonical chain result, and allow reconciliation to finish. Never create a replacement operation just because a request timed out. Expired unsubmitted payout quotes may be cancelled through the authenticated cancellation route, then freshly quoted and authorized. If submission may have occurred, cancellation must remain blocked. After restart, confirm health timestamps advance and existing operations reconcile without additional transfers.

Webhook delivery runs independently of money execution. First activation stores a cutoff in `hashpaylink:marketplace-webhook-worker-activation:v1` and excludes older pilot events. Retries retain event identity, use leases/backoff and stop in a dead-letter state after the retry budget. Consumers must verify the existing signed webhook contract and deduplicate by event ID. To replay a reviewed event, founder POST `/api/marketplace-operations` with exactly `projectId, paymentId, eventId, expectedWebhookUrl, reason`. The URL must match the current HTTPS project destination, reason must be 10–300 characters, and delivered/in-flight events cannot be replayed. Approval is audited, retains previous attempt history and only queues delivery; the independent worker and project allowlist must also be active. Do not replay historical pilot events without recipient approval.

## Activation acceptance

Before external activation: confirm two intended seller wallets and exact approved canary amounts/fees; demonstrate the full flow using a developer key; confirm commission and holding reconciliation; verify partial buyer refund; observe signed webhook acceptance/deduplication and authorized receipt inbox delivery; verify fresh bounded gas coverage, outage/restart behavior and operational alert delivery. No additional canary funds or external notifications are authorized solely by this runbook. USDT, NGN and arbitrary bank disbursement remain outside this launch.

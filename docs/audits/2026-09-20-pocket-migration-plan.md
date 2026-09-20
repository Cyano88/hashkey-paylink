# Pocket migration transfer preparation

Local changes only. No transfer endpoint is enabled, no production data was changed, and no wallets were activated.

The balance review now reads exact six-decimal USDC units from the existing server RPC reader, bypassing its display cache and approximate fallback. Missing links are unavailable, not zero. Successful three-network reviews save an account-scoped plan in the existing durable PostgreSQL store. The plan binds source wallet IDs, matching replacement wallet IDs and addresses, exact amounts, and the preparation attempt in a revision hash. It is not a completion or readiness record.

Internal transfer reservations retain their idempotency key across reload/retry and prevent a changed review from replacing an operation after reservation. The reservation primitive is not wired to a signing or transfer endpoint. Its caller will need an atomic durable mutation and all execution checks.

Validated with synthetic tests: exact amounts beyond safe JavaScript integer range; missing, foreign and agent links; partial or split replacements; stale reviews; zero-balance rejection; lost-response/restart retry; plan replacement prohibition after reservation and completion. Existing replacement authorization and completion tests also pass. No live financial tests were run.

Remaining before enabling execution:
- Reuse the existing Pocket payment execution and ledger facilities for each migration transfer.
- Fresh provider ownership verification for every source and target, inventory of non-USDC assets, and pending-operation checks.
- Fee estimation/sponsorship and the user's payment approval for the exact reviewed transaction.
- Persist and reconcile Circle challenge/transaction references; verify receipts and sufficient finality without duplicate submission.
- Atomically activate all three links with compare-and-swap and the completed record.
- Preserve old-wallet history and access, handle later incoming funds, and invalidate old client sessions safely.
- Verify the complete flow on the mobile app before displaying Migration complete.

## Execution and activation services added locally

The internal executor now uses the existing payment execution repository and ledger. It consumes an injected payment-approval verifier after fresh preflight, atomically reserves each network before contacting the provider, and keeps ambiguous provider failures reserved for reconciliation. A saved challenge is authorized, not completed. No public execution or activation route exists yet. Production preflight and Circle-session adapters remain required.

Receipt validation requires the saved challenge to resolve to the source wallet, the exact source/recipient/token/amount, a successful receipt in its canonical block, and a finalized height covering that block. It uses at most three RPC reads per verification and does not scan logs or create a polling loop. Arc units follow the existing repository's native USDC event representation, tested synthetically; provider support for finalized tags still requires live read-only verification.

Activation uses a PostgreSQL transaction spanning legacy link archival, all three payment links, the completion record, and the plan. It takes the existing link advisory locks, checks current links against the expected sources, and fails on a conflicting legacy archive. The verifier must establish fresh empty old balances, accounted-for assets, no pending operations, and working legacy access. These production checks are not yet wired.

Tests: migration execution concurrency, approval denial, stale/failed preflight, timeout without resend, ledger reconciliation; exact and incorrect receipts, canonical/finalized blocks, Arc event precision; activation replay and simulated rollback at each link update. These are synthetic tests, not a live balance migration or a real PostgreSQL integration test.

Official reference inspected for subsequent provider integration:
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-transaction-estimate-fee
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-transaction

Still required before deployment: connect real payment approval and Circle fee/challenge adapters; complete asset/pending-operation verification, old-wallet access/history and new-session restoration; then test the complete mobile flow. No migration transfers or link changes were performed in this work.

## Activated session restoration and purchase-history continuity

Added an authenticated restoreActivatedEvmWallets action. It requires a completed migration record and the three exact active payment links, then reads each wallet through the caller's Circle user token. It rejects missing ownership, wrong chains, non-live wallets and split addresses. It returns public wallet metadata only and never changes a link. Unauthenticated calls are covered by the existing replacement endpoint test.

The mobile controller attempts this restoration only when its retained Circle session does not match the current Pocket wallet. The server-approved wallets replace the Base/Arbitrum/Arc session metadata in encrypted storage; previous wallet metadata is retained. Failed verification does not save a replacement session. Fresh Base login also checks wallet ID before saving.

Existing hosted purchase lookup now includes old payment addresses validated against the completed record and archived links. No old wallets were added to automatic RPC activity scans. This preserves durable hosted-checkout lookup; it does not claim all historical on-chain events have been archived or that old-wallet spending UI is finished.

Focused TypeScript check passes after fixing two session typing issues and an undefined Solana cancellation helper. Synthetic session/ownership/history tests, completion tests, replacement authorization tests, activity adapter and Solana recovery tests pass. New-session restoration has not been exercised against a genuinely completed live migration.

Still not enabled: transfer signing/fee adapters, full asset and pending-operation checks, old-wallet recovery UI and full on-chain-history preservation, and the complete mobile migration flow. Keep legacyAccessReady false until these access requirements are implemented and verified.

Validation: the Pocket-native Vite build completed with exit 0. No APK was installed and these changes were not deployed in this stage.

## Circle provider, approval and recovery adapters

Added the internal production migration service using the existing Circle transport, server-owned wallet links, one-use Pocket payment approval, payment execution repository and receipt verifier. Transfer calldata contains exactly one USDC transfer to the bound destination. Circle reads and challenge creation use the authenticated user token and a 15-second request timeout. No new execution route or mobile transfer CTA has been enabled.

Fee quotes bind owner, plan revision, network, both wallet IDs, amount and expiry. A higher fresh estimate or expired/mismatched quote fails the preflight. Quotes replace a single record per owner/network instead of creating an unbounded history. The displayed network estimate does not prove gas sponsorship; live fee treatment still needs checking before release.

Inventory requests explicitly use includeAll=true and paginate until an empty page, with a four-page ceiling. A repeated/inconsistent page, unavailable inventory, extra held asset or unresolved transaction prevents execution. Pending checks request at most one record per unresolved Circle state. These run only for requested migration work; no background polling was added. The inventory is provider-reported coverage, not a claim to discover every possible asset on-chain.

Legacy USDC recovery plans bind archived source wallets to the current owned Pocket destinations. A pending recovery is retained; later deposits can be reviewed after the previous recovery is confirmed. Recovery has its own durable plan and never changes active wallet links. Its mobile screen and HTTP orchestration still need connecting before activation can be enabled.

Tests passed: provider request/calldata boundaries, ownership, paginated inventory, extra assets, pending states, fee scope/expiry, saved-challenge transaction binding, existing Pocket payment approval, execution concurrency/reconciliation, and legacy recovery ownership/resumption. Focused TypeScript check passed. Tests use synthetic fixtures, not production user data.

Live read-only check: Base (8453), Arbitrum (42161), and Arc (5042) each returned the expected chain ID and a finalized block. This used the locally configured read service endpoints, not a Render environment inspection. No wallet balance was requested and no transaction was submitted.

Provider references verified:
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-transaction-estimate-fee
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/list-wallet-balance
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/list-transactions
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-transaction

Remaining release requirements: HTTP/mobile orchestration, recovery UI and prior-wallet activity access; migration-time coordination with ordinary outgoing payments; live fee/sponsorship and authenticated provider response validation; full mobile end-to-end verification. Activation remains disabled. No production wallet links or balances changed.

### Mobile execution review integration
- Connected successful three-network balance review to the migration execution component. Removed the duplicate parent refresh button in that stage; unavailable balances still require a fresh review.
- Status refresh is read-only, fee estimates expire locally without repeated requests, pending transfers use reconciliation, and server-verified completion alone opens Proceed to Pocket.
- Added initial request locking and stale-quote clearing. Transfer approval must match the currently authenticated bearer token; account changes require approval again.
- Validation: focused TypeScript check passed for the preparation component and HTTP handler. New HTTP smoke tests passed for authentication, ownership, strict input, stale revision, release gate, read-only refresh, reconciliation and completion. Existing execution, activation rollback and completion smoke tests passed.
- All tests are local/synthetic. No transfer, active-wallet switch, deployment, or new phone installation occurred. The production adapter remains disabled; live fee treatment, outgoing-payment coordination, challenge recovery and old-wallet recovery UI remain release blockers.

### Interrupted approval continuation
- Added a read-only Circle challenge inspection using the documented user challenge endpoint. Only a saved PENDING challenge without provider errors and an INITIATED transaction on the expected source wallet/chain/contract, without a transaction hash, is eligible to continue. Ownership is checked through the authenticated Circle user session.
- Added a separate resume action: consumes fresh Pocket payment approval, rechecks provider status and durable reservation, and returns the exact saved challenge. It cannot create a replacement challenge, reservation or transaction.
- Reconciliation now reports approval-required versus pending versus needs-review. Mobile displays the saved amount and both wallet addresses before Continue approval. Provider errors, uncertain responses, missing challenge IDs and terminal failures do not trigger automatic retries.
- Focused TypeScript validation passed. Execution, provider and HTTP synthetic tests cover saved-challenge continuation, account mismatch, release gating, expired/failed challenges and absence of repeat provider submissions.
- This does not resolve an original provider response lost before its challenge ID was persisted, nor recreate expired or failed challenges. Those cases remain review-required release blockers. The feature is local and disabled, with no deployment or fund movement.
- Circle reference checked: https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-user-challenge

### Lost provider response recovery
- Circle's contract execution reference explicitly documents same-idempotency-key replay returning the original response. Added an explicit recovery action behind the existing disabled rollout gate and fresh Pocket payment approval.
- Before the original provider call, persist a SHA-256 fingerprint binding network and the exact contract execution request (original key, source wallet, destination calldata, amount, fee level and reference). Recovery checks this fingerprint and the authorized ledger record, retains the same key, then saves the returned challenge for subsequent reconciliation. It never invokes the signing SDK.
- Concurrent recovery attempts share an atomic 60-second retry guard. Timeout retains the reservation, fingerprint and guard; status reads cannot replay requests. Older records without a fingerprint stay under review. Existing challenge IDs cannot be overwritten by recovery.
- Mobile recovery is a separate Recover transfer status action; continuing the saved approval remains a subsequent user action.
- Validation: focused TypeScript check and execution/provider/HTTP smoke tests passed, including same-key replay, amount/owner mismatch, concurrent recovery, repeated timeout and payment approval denial. These are synthetic tests, not live Circle idempotency verification.
- Expired/failed challenges still cannot be replaced automatically. Provider terminal-state handling, old-wallet recovery UI, outgoing-payment coordination, fee/sponsorship verification and activation integration remain release blockers. Nothing deployed or transferred.
- Reference: https://codegen.circle.com/api-reference/wallets/user-controlled-wallets/create-user-transaction-contract-execution-challenge

### Consolidated release candidate
- Connected the real activation verifier to the existing atomic switch service. It checks all old USDC balances, provider asset inventories, pending provider operations and unresolved payment intents before the three links can switch together.
- Added durable per-wallet holds at the shared Circle mutation transport and serialized owner migration start/activation. Holds target exact source wallet IDs. Unstarted failures release holds; reserved migrations retain them. Completed old wallets stay protected from ordinary spending while authenticated legacy recovery uses the stored ownership record.
- Added Previous wallets review and recovery API/UI. Recovery targets the current linked wallet on the selected network, preserves pending recovery state, uses the same fee/approval/receipt safeguards, and never switches active links again.
- Fixed partial-migration restart to load the original plan rather than rebuild it from reduced balances. Proceed to Pocket reloads the app after completion to clear stale in-memory wallet addresses.
- Native Vite and isolated release Vite builds passed. Focused TypeScript passed in both checkouts. Existing payment-security, EVM/Solana Gas Station, activity and migration receipt tests passed. Source-level wallet hold and restart regressions passed.
- Release remains disabled. Expired/failed challenges still require operator review rather than replacement. Actual PostgreSQL lock behavior, authenticated live Circle inventory/fees/sponsorship and real device activation remain unverified. ADB reports no connected phone; user was asked to reconnect it. This is not evidence of a completed live migration.
- Final functional browser walkthrough at 390x844 passed preparation, balance review, fee review, pending transfer, Continue approval, receipt reconciliation, activation and Migration complete with Proceed to Pocket. Fixture counters: 2 security approvals, 1 mock signing invocation, 1 transfer start, 1 activation. This was a synthetic provider flow, not a visual/native/financial verification.
- Android assembleDebug passed (366 tasks). APK assets were compared against the verified native build. No installation occurred because no ADB device is connected.

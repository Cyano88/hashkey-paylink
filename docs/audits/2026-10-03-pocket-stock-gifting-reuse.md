# Pocket gifting reuse audit — 2026-10-03

Scope: source-level integration audit at f73d92c85. No production gift was funded or claimed; no full contract security audit or live deployment verification is asserted.

## Decision
Reuse one Pocket gifting experience, gift-link format, code redemption and lifecycle. Extend the existing flow with explicit asset and wallet adapters; do not fork a second stock gifting product. Preserve existing Base USDC gifts and saved credentials.

## Existing flow
- Native Send a gift -> Base USDC amount and optional 160-character message -> review principal, creation fee, total and expiry -> payment approval -> Circle wallet approval -> chain-confirmed funding -> QR/link/code sharing.
- Single claimant bearer gift: anyone possessing the link/code may claim. No named recipient binding at creation. Claim signature binds the eventual recipient address, gift, escrow, chain and deadline.
- Gift secret persists in the OS credential store before funding; local index is account-scoped. Sender recovery/list depends on local saved drafts. Code service separately holds authenticated encrypted code/secret records; fragment secrecy does not mean the code service never receives the secret.
- Draft default expiry is seven days; backend allows up to 30 days. Expired funded gifts return principal to the sender through an explicit refund; creation fee is not refunded. Worker reconciles state; it does not automatically execute refunds.
- Creation fee is 25 basis points (0.25%), rounded down in token base units. Network sponsorship is separate.
- Server deployment registry and public rollout enable Base only. Broader frontend network constants and multi-claim validation do not establish shipped support. Current create UI always uses one claim.

## Reuse boundaries and gaps
1. Shared UI: PocketGiftCreate/SendPage, preview/redeem/claim sheets, share QR/link/code, lists, status polling and completion artwork. Replace hardcoded USDC, Base and stablecoins styling with validated gift asset metadata and origin rail. Claim completion must route to the gift asset's wallet rather than always Stablecoins home.
2. Types and persistence: GiftView/GiftRecord/SavedGiftDraft currently assume USDC precision, Base or Circle networks. Add a versioned asset descriptor (rail, chain ID, token address, symbol, decimals) and exact quantity units. Keep a backwards-compatible decoder for existing v1 gifts, without changing their secret, identifiers or storage keys. Filter lists/activity by asset rail.
3. Wallet execution: current funding, claims and refunds require Circle sessions, linked Circle wallets and challenge IDs. Retain that adapter for USDC; add an XStocks wallet adapter with ownership/PIN, RPC balance/allowance/fee checks, simulation, transaction submission and receipt verification. OKX display balances cannot authorize spending or establish settlement.
4. Escrow: PocketGiftEscrow has an immutable token and constructor requires six decimals. The configured deployment is Base USDC only. An X Layer stock escrow needs a reviewed token-aware design, supported-token allowlist, per-token liabilities, quantity precision, exact transfer verification and asset-bound gift records. Merely adding xlayer to the network enum is insufficient. No deployment was performed.
5. Fees: do not silently interpret USDC fee accounting as stock fees. Decide whether the creation fee is charged in the gifted stock or separately in USDC, and specify claim/refund sponsorship for recipients without OKB. Reuse the review screen to disclose it.
6. Receipts: current gift receipts enter the Circle action journal and have USDC-specific memo/fee formatting; stock gifts require asset address/symbol/decimals, quantity and rail-aware activity. Do not let stock receipts inflate Stablecoins balances or appear as USDC transfers.
7. Integrity and recovery: retain database locking, idempotent provider attempts, unknown-authorization recovery, canonical-chain evidence, recipient-specific confirmation, encrypted codes and durable rate limits. XStocks adapter must preserve those properties despite a different transaction provider.
8. Source documentation drift: escrow header still says not deployed, while the production source registry pins a reviewed Base deployment and enables its rollout. Correct this during implementation; source configuration is not a substitute for live bytecode verification.

## Proposed implementation order
1. Extract shared asset-aware gift presentation and versioned model while preserving current USDC behavior and native secret storage.
2. Add XStocks stock selection and exact quantity review using the same create/share/redeem pages, behind a disabled capability flag.
3. Implement and review the X Layer escrow and wallet execution adapter, including fees, sponsorship, token transfer restrictions and refund availability.
4. Extend chain observation, recovery, receipts and activity routing; only advertise stock gifts after deployment and funding/claim/refund verification.

## Validation
Existing backend, funding/recovery, claim controller, code, receipt and reconciliation worker smoke suites were run. TypeScript-backed scripts require node --import tsx; initial plain-node runs hit module resolution errors, then were rerun with that loader. No real-money actions were taken.

## Source map
- src/pocket/pages/PocketGiftSendPage.tsx
- src/pocket/pages/PocketGiftPage.tsx
- src/pocket/api/pocketGiftsClient.ts
- src/pocket/features/gifts/{pocketGift,giftDraftVault,pocketGiftFunding,giftFundingController,giftClaimController}.ts
- api/pocket/gifts/{index,service,types,circle,chain,codes,receipts,worker,rollout}.ts
- contracts/contracts/gifts/PocketGiftEscrow.sol

## Multi-recipient implementation checkpoint

Local only; not pushed or enabled. This is an implementation checkpoint, not a completed integration.

Implemented:
- PocketMultiGiftEscrow: immutable supported-token list, equal per-claim quantities, 1–1000 claims, one claim per gift-scoped account and wallet, dual bearer/account signatures, fixed creation fee, per-token liabilities and partial refunds after expiry.
- Shared create form accepts a capability-controlled recipient count (default remains one), calculates total principal from amount per recipient and validates limits. Legacy Sender explicitly rejects a multi-claim draft instead of silently creating a single gift.
- Exact-unit funding/calldata and claim typed-data helpers for USDC and stock precision.
- Server-only claim authorization helper binds a verified wallet and gift-scoped pseudonymous account ID. There is no active signing key or HTTP route for this helper.

Validation: 25 contract tests passed including the existing single-gift suite; new exact-unit/account-authorization checks, shared-form browser checks and existing funding-recovery checks passed. Initial browser fixture required a MemoryRouter and was corrected. No real-money operations or deployments.

Required to complete before enabling:
1. Versioned persisted drafts and server records, per-account claim attempts, v2 endpoint dispatch and idempotent funding/claim/refund execution. Current form capability is deliberately not enabled by production config.
2. V2 canonical chain observation, partial-claim receipts and reconciliation, remaining-claim display, claim-completion routing, shared code lookup for available partially claimed gifts.
3. Circle Base adapter for v2 calls; XStocks adapter and stock selection within the shared flow. Existing Circle challenge metadata must not be reused as a Privy transaction attempt.
4. Stable gift identity HMAC secret and claim-authority signer provisioning; immutable authority availability/recovery requires explicit operational review. Authority compromise could bypass account uniqueness for someone who also holds a gift link; it cannot claim without the bearer signature.
5. Decide/verify stock creation fees and sponsorship. Draft contract charges 25bps in the gifted asset; this is not an enabled product policy.
6. Full review including same-block competing final claims, blocked/deflationary/reentrant token behavior, restricted stock transfers, outgoing exact-transfer handling, chain-specific EVM target and signatures, then deployment manifest/bytecode/treasury verification and end-to-end funded claims/refunds.

Existing Base USDC deployment, old links and native credentials remain unchanged. Do not describe the multi-recipient feature as usable yet.

## Integration update — second implementation pass

The Base USDC multi-recipient path is now wired locally through the existing service and UI:
- v2 saved drafts preserve count and total alongside legacy v1 drafts;
- create request binds count into idempotency identity without changing v1 bindings;
- account-scoped approval attempts and persisted authority signatures reuse Circle batch approval/funding/claim/refund handling;
- canonical v2 contract observation verifies pinned bytecode, treasury, authority, token, fee and gift details, scans bounded event ranges, and records every claimant receipt;
- claim completion is account-specific; exhausted gifts remain confirming while historical evidence is incomplete;
- the shared public gift page and sender list display remaining claims;
- partial refunds carry the returned amount into activity rather than crediting the full original principal;
- worker reconciliation includes v2 records and per-account attempts;
- an empty reviewed deployment registry plus dedicated authority/identity configuration keeps production maxRecipients at one. No deployment or environment changes were made.

Verification: 26 contract/integration checks passed in a combined run, then two additional final-claim race/blocked-payout checks passed (8 multi-contract tests total). Local integration exercises 100 USDC -> ten claims of 10, individual receipts and a separate partial-refund flow (one claim, 90 USDC refund). Shared-form browser checks and focused TypeScript checks pass with zero diagnostics. Existing backend, funding recovery, receipts, codes and worker suites pass. Circle is simulated at the wallet-call boundary; real Circle sponsorship is unverified.

Remaining before release: contract security review, reviewed Base deployment and authority provisioning, production Circle sponsorship/approval verification and deployment manifest. XStocks uses the same contract quantity primitives but its stock selector, record asset metadata and Privy wallet execution adapter are still not integrated; do not advertise stock gifting as completed. Existing deployed gifts remain on v1.

## Stock adapter checkpoint — pending fee decision

Added catalogue-bound stock identity, on-chain decimals and X Layer checks, plus RPC gas/fee preflight. The helper does not itself validate or authorize arbitrary calldata and is not exposed as a production signer. Tests cover unsupported token, wrong chain, invalid precision, nonzero native value and insufficient fee balance. A concurrent claim reservation now rejects an account already settled inside the durable mutation as well as during the earlier check.

User decision requested: charge the creation fee in the gifted stock or separately in USDC. Do not activate the draft in-kind stock fee policy without that answer. Stock execution, selector and asset-aware persistent receipts still require integration; no stock gifting launch is claimed.

## Approved stock fee policy

The user confirmed that the creation fee is paid in the gifted stock, on top of principal. Rate: 25 basis points (0.25%), rounded down to the token's smallest unit as in the escrow. Recipient quantity is not reduced. Example: ten shares of 0.1 stock require 1 stock principal plus 0.0025 stock fee, for a total 1.0025-stock debit. Network fees remain separate. This supersedes the pending fee decision above.

The shared exact-unit planner now names this policy explicitly and provides review rows for principal, per-recipient quantity, fee and total debit. Automated checks assert the example, fee token identity and smallest-unit rounding. This does not yet activate stock gifting or deploy an escrow.

## Variable-recipient stock flow checkpoint

The existing gift form now accepts a stock asset and recipient count from 1 through 1,000; a browser check covers 1,000 shares with sub-six-decimal stock precision and rejects 1,001. Versioned native drafts preserve stock identity and precision. Shared presentation and gift lists display stock symbols; v2 records/observation accept asset metadata, and stock receipt metadata is excluded from the Stablecoins activity projection.

Added stock funding execution primitives: catalogue/chain/precision verification, pinned runtime/treasury/authority/token/fee checks, RPC balance and allowance checks, exact bounded approval, fresh state after approval and existing-gift rejection before funding. A test exercises 1,000 x 0.001 stocks, totaling 1.0025 stocks including the approved fee, and rejects insufficient balance, changed precision and changed bytecode.

These primitives are not yet connected to the Privy submission/recovery coordinator or claim/refund adapters. The stock API execution guards remain closed and there is no enabled X Layer deployment. Remaining work is actual wallet wiring, stock claim/refund recovery and activity feed plumbing, then security/deployment/sponsorship verification. No production or Pixel update was made.

## Wallet and shared-flow integration checkpoint

This supersedes the unwired-adapter statements in earlier checkpoints. The shared sender and claim pages now route X Layer gifts to the existing Privy XStocks wallet and preserve Circle for Base USDC. The stock menu uses the shared gift routes only when reviewed stock deployments are available. Draft lists preserve the selected rail, and authenticated stock gift receipt history is merged into XStocks activity with underlying-transfer deduplication.

Stock approvals carry a structured intent, not executable server calldata. The client binds operation, gift, recipient, quantity, expiry and asset to the prepared claim or saved draft. Wallet execution checks a shared reviewed manifest, RPC token precision, bytecode, treasury, authority, allowlist and fee. Claims additionally verify both EIP-712 signatures and account/wallet claim state. Refunds require the original sender, on-chain expiry and remaining shares.

The existing durable submission journal now records gift ID, attempt and operation. Unknown broadcasts remain blocked; known failed attempts can recover without changing the gift. Canonical gift receipt proofs can reconcile only the matching journal entry. A hash alone never marks a gift as funded or claimed. Funding preflight failures before any submission can safely return to review.

Validation: 28 contract/integration tests pass; existing backend, funding, claim, receipt, worker and code suites pass. New tests cover stock service/client routing, 1,000 shares and exact in-kind fee, operation tampering, stock claim/refund signature and state checks, and unknown-broadcast recovery. Shared gift form browser checks pass. The modified TypeScript roots report zero diagnostics (not a repository-wide clean-typecheck claim).

Release remains disabled: both reviewed v2 deployment registries are empty. No authority/identity keys have been provisioned, no contract has been deployed, and no live Privy transaction or Circle sponsorship test has been performed. Before activation, perform contract security review, deploy and pin the approved token/runtime/treasury/authority configuration, provision persistent authorization keys, and verify native funding, claim, partial refund and interruption recovery with the actual wallets. No production or Pixel changes were made in this checkpoint.

Production frontend build passed (Vite, 2m 18s). Build warnings concern dependency annotations, mixed static/dynamic imports and chunk size; no build errors. Tracked dist files were restored after verification because this change is not being released yet.

## Release preparation and review follow-up

User confirmed the existing Pocket treasury and deployment signer 0xaA6EE4589832Fb9FA49c27cB56CBcecf29B847c7. Read-only X Layer checks confirmed the signer has native fee funds, is an EOA and has pending nonce 1. No matching signer key was found in the existing deployment environment files; no key was requested from the user.

Applied the installed Solidity Auditor v3 review perspectives through three grouped reviewers (runtime concurrency limit), not the full twelve-agent workflow; upstream VERSION was 4. No proven on-chain fund-theft or signature-bypass finding. Fixed functional review findings in createPocketGift (obsolete stock rejection), readPocketGift (six-decimal USDC validation applied to stocks), Sender (lost rail query), and gift-list cache namespace. Refund approval now also verifies the operation and gift ID.

A confirmed-block reorg lead in observeMultiGift/refresh is addressed by pinning and revalidating the evidence cursor block hash before trusting cached receipts. On mismatch the service fails closed and requires reconciliation; this is not an automatic deep-reorg recovery system, and already published historical receipts still need operator reconciliation. New v2 records only; existing v1 receipt behavior is unchanged.

Added a read-only multi-gift deployment verifier and an unsigned deployment planner. The planner checks compiled source freshness, catalogue membership, token code and precision, chain, dedicated EOA authority, constructor simulation, nonce, gas estimate and fee balance. All 808 current catalogue contracts passed code/precision checks in the unsigned X Layer plan. Those checks do not establish issuer transfer-policy suitability; live transfer/claim/refund validation remains required.

Dedicated authority and identity secrets were generated, protected using Windows DPAPI CurrentUser outside the repository, provisioned individually into Pocket's Render service and read back without printing values. No service deployment was triggered. The local deployment review page serves only public transaction data at http://127.0.0.1:8176 and requires the specified injected wallet. Browser testing used a mocked wallet only and verified no automatic signing, exact calldata and duplicate-submission blocking.

Validation after fixes: 28 contract/integration tests, backend regression, stock create/read/approval tests, release preflight/reorg guard, shared-form browser checks and focused TypeScript checks passed. Unsigned plan is .codex-temp/pocket-stock-gift-unsigned.json. Neither a deployment transaction nor a funded gift has been sent. Both v2 activation registries remain empty. The pending external step is user wallet signing, followed by deployed-code verification and live native canary checks.

## Confirmed X Layer deployment

The user signed the prepared deployment. Transaction 0x6f37795071bd7e3fe0f67f9480b6235fec59731c6d319acca0704ebdfd02e9aa created 0x0BF819a2bdB78f059937Ee3C3e6498473dcdeABE at block 72248488. Verified sender, nonce, zero native value, exact constructor calldata hash, successful canonical receipt and deployed runtime hash against the prior simulation. Treasury, authority, 25 bps fee and 1,000-recipient limit match the plan. All 808 allowlisted catalogue tokens and their precision were checked against a common confirmed block; deployment and verification block hashes were rechecked afterward. Public evidence is stored in contracts/deployment-plans/pocket-multi-gift-xlayer-20261003.json.

No gift was funded or claimed by the assistant. Application activation registries remain closed pending native Pocket funding, claim, refund and interruption tests. The contract deployment is complete; application activation is a separate remaining step.

## Restricted native pilot

The user selected Pocket ID shy for the live pilot. The verified X Layer deployment is now pinned in src/pocket/lib/pocketStockGiftDeployment.json. Server funding is restricted to authenticated exact pilot handles; public funding defaults closed. Claims and refunds remain available independently of funding permission. Render pilot IDs were set to shy and public funding to false, with per-key readback verification. Existing authority and identity secrets were retained.

Pilot isolation, stock create/read/approval, claim/refund, submission recovery and focused TypeScript checks pass. The production source build passed. Render's live build command builds from source, so generated local dist changes are excluded. Live funded gift, recipient claim, partial refund and interrupted native transaction checks remain pending user wallet interaction. This checkpoint supersedes the earlier empty-registry status.

## Verified UI correction and Base recipient-count prerequisite

User clarified: preserve the Stablecoins gifting layout with XStocks details and colours. Shared network panel now appears on both rails, with the existing Pocket stock picker replacing the native select. Sender, claim-entry and completed-claim return paths retain the correct rail. Gift metadata updates the page colour scope before wallet approval instead of hard-coding Stablecoins.

Shared-form regression, focused TypeScript checks and production build passed; 390px light/dark visual fixtures were inspected for both rails, with no horizontal overflow and working stock selection. Live Base configuration still reports maxRecipients=1. Base runtime was checked on-chain against the pinned single-recipient contract hash, and MAX_CLAIMS is unsupported. A Base USDC multi-gift unsigned deployment was simulated with sufficient signer fee balance. Signing review at local port 8177 passed mocked wallet checks. No Base deployment or USDC funding was sent; production multi-recipient Stablecoins remains pending deployed-code verification and Circle flow validation.

## Pixel-verified menu and status-area correction

Inspected the actual Pixel at 1280x2856. The stock gift page was grey below a black Android status area, and X Layer's black SVG was incorrectly treated as a dark-source image. Gift routes are now excluded from legacy global dark utility overrides, preserving their explicit black canvas and shared field colours. X Layer's logo now inverts in dark mode. Compared the corrected Stablecoins and XStocks gift forms directly on Pixel; both have continuous black status/header/content surfaces.

Gift menu rows now render synchronously on both rails rather than waiting for authenticated gift configuration. Funding and pilot checks remain in the gift page and server. Verified send/receive menu visibility and route navigation with all browser network requests blocked. Stock send-gift shows Gas + Fee, stock claim shows Gas, and Stablecoins send-gift shows Fee. Existing X Layer address Gas label remains.

Focused TypeScript checks and the native build passed. Updated Pixel using install -r, preserving app data. Actual device captures show both gift menu labels, the corrected X Layer logo and matched dark backgrounds. No gift approval, funding or claim was submitted. Base multi-recipient deployment remains unsigned and gated.

## Gift picker holdings and price wiring

Corrected an implementation omission: the gift form previously built stock catalogue entries without a wallet snapshot, then forced every balance to null. The sender now passes its existing account-scoped display snapshot to the gift picker. The picker reuses cached stock quotes, shows quantity held, per-token USD price and approximate holding value, sorts positive holdings first, and distinguishes zero from unavailable data. Stale display data is labelled last known. Price requests cover the selected token and up to 30 picker results, using the existing shared cache. Transaction validation remains unchanged.

Verified with a browser test covering holding precision, per-token and holding valuation, zero versus incomplete-snapshot holdings, absent quotes and requested-token bounds. Shared gift-form regression and focused TypeScript checks passed. Native build passed, installed with adb install -r, and inspected the actual Pixel picker: held stock appears first with quantity and price, unheld rows show zero and current prices. No financial action was submitted.

## Circle Base multi-recipient deployment - 2026-10-03

Verified the original Base gift deployment used the existing Circle developer-controlled Base smart account. The earlier external-wallet deployment plan is superseded. Deployed PocketMultiGiftEscrow through that same sponsored Circle wallet; Circle contract and transaction both report COMPLETE. Transaction 0x5f5f2b27784c5b1f540b27cbea607185e5e2818d387760862297fa71eae4cab4 created 0xa4df7dc962a278d1215b8b05255ea1bfd32a4c57 at block 52122221.

Verified exact constructor init code, successful canonical receipt, compiler runtime with immutable slots accounted for, Base USDC allowlist and six decimals, treasury, authority, 25-bps fee, 1,000-recipient limit and successful sponsored Circle user operation. Public evidence is contracts/pocket-multi-gift-base-deployment.json. The Base multi-gift registry now pins this deployment; single-recipient gifts retain the existing contract. Existing authority and identity secrets were retained.

Validation: 28 contract/integration tests, backend regression, multi-gift smoke tests and focused TypeScript checks passed. Release and Pixel recipient-input verification pending. No new USDC gift was funded, claimed or refunded; a live end-user funding/claim cycle remains untested for this new deployment.

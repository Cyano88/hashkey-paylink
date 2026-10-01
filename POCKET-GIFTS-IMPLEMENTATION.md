# Pocket gifts — first implementation and audit, 2026-10-01

## Built locally

- Reusable gift landing and claim sheet, following the supplied gift-card reference with Pocket Jakarta, neutral Heroicons, network marks, black dark theme and existing CTA/sheet components.
- Sender form: network, exact USDC amount, optional message, Continue. One-recipient preview first.
- Claim sheet requires an explicit close; backdrop clicks do not dismiss it. Pending/terminal states do not offer redemption.
- Integer USDC accounting, equal-share drop validation, strict capability link parser. The public ID alone is not a claim credential.
- Development-only preview. No production routes, menu changes, funds, fake receipts, wallet calls, or automatic claims.

Run `node scripts/preview-pocket-gifts.mjs`, then open http://127.0.0.1:5187/pocket-gift-preview.html.
Preview controls are outside the product design. They let reviewers inspect states and themes without moving funds.

## Existing infrastructure checked

- `PocketTransferMenuPage`: Send and Receive are list flows; gift entries can be added once enabled.
- `PocketNativeBridge`: warm app links and cold launch URLs exist.
- Android manifest: Pocket HTTPS host and pocket scheme already declared. This does not itself prove store-install link restoration.
- No dedicated gift funding/claim service found. Existing requests resolve known recipients and are not prefunded bearer gifts.
- No Android install-referrer integration found in the native source inspected.
- Current reusable sheets and neutral network selector are used by this implementation.
- AGENTS.md forbids rebuilding gifts on retired direct/ghost-vault payment rails; those were not used.

## Funding/claim work still required before enablement

1. Dedicated funding mechanism with reviewed onchain enforcement: confirmed funding before sharing; one claim per slot; exact token/network/amount; refund only unclaimed funds after expiry; claims disabled once expired. No legacy vault reuse.
2. Capability possession plus authenticated recipient wallet binding. A plaintext bearer-secret claim in a public mempool is not safe: copied proof must not permit redirecting the payout. Recipient-bound authorization and atomic contract state need review and tests.
3. Per-gift/per-recipient idempotency, database uniqueness and onchain reconciliation. A timeout is not a failed transfer. Never release a reserved slot while a broadcast may still settle; reconcile first.
4. Source-chain USDC only initially; no implicit bridge. Network availability depends on deployed, tested gift execution support, not the six-network preview list. Solana needs a distinct implementation.
5. Sender quote: recipient amount plus platform/network/funding and redemption costs. Existing 0.25% policy must be applied exactly once. Define sponsored claim costs before enabling campaigns; recipient cannot be stranded by needing gas.
6. Public gift payload must exclude email, identity documents and claim secrets. Fragment avoids HTTP URL logging, but JS can read it: no analytics/third-party scripts on claim page, strict CSP/referrer rules, redact telemetry and never put capabilities on 0G. Public codes must have adequate entropy and online rate limits.
7. Claim authority persists securely through sign-in. Wallet creation completes first; explicit Claim stays required. A gift ID or installation alone cannot authorize a payment.
8. Install restoration requires platform-specific implementation and verification. Android install-referrer is not present; do not promise automatic restoration. Fallback is reopening original link or manually recovering the complete gift credential. Do not put the claim secret in a store URL.
9. One activity row per user's gift movement and accurate receipt states, with onchain confirmation before success. Failed, expired and refunded states remain distinct.
10. Public drops: fixed per-person amounts, expiry, capacity and anti-bot controls; one account is not proof of one human. Race tests must demonstrate no overspending or duplicate payouts before rollout.

## Validation

- `node --import tsx scripts/pocket-gifts-smoke.mjs`: exact amount parsing, fractional precision rejection, equal allocations, malformed/cross-origin capability links and state copy.
- `playwright-cli -s=pocketgift run-code --filename=scripts/pocket-gifts-browser-check.js`: mobile light/dark flow, outside-click protection, disabled redemption in terminal states, sender validation and 320px overflow check.
- TypeScript diagnostics for all four new TS/TSX files: zero.
- Visual inspection: gift page and claim sheet; fixed local shared-node_modules font loading and legacy dark palette bleed by using Pocket's colour scope.

This checkpoint is a UI/domain foundation, not a live gift service. No production deployment or Pixel installation was performed for gifts.

## Funding checkpoint — 2026-10-01

Implemented locally:

- `contracts/contracts/gifts/PocketGiftEscrow.sol`: dedicated non-upgradeable, single-recipient EVM draft. Atomic exact USDC funding, separately collected 25-bps fee, recipient-bound EIP712 redemption and permissionless execution of refunds to the original sender after expiry. No owner, upgrade or admin withdrawal. Tokens sent manually do not create gifts.
- Gift IDs are scoped to the sender and salt to prevent another sender reserving the same ID. Contract status enforces one final disposition: claimed or refunded.
- Fee rounding matches `paymentFeeBreakdown`: integer floor. A 100 USDC gift requires 100.25 USDC before any network costs. The recipient gets 100 USDC; an expired gift refunds 100 USDC principal. Creation fee is not refunded by this draft and must be disclosed before approval.
- Capability key signs chain-, contract-, gift-, recipient- and deadline-bound typed data locally. Only the signature and bound claim parameters need to reach a relayer. A copied signature cannot redirect the payout; it can only execute the authorized payout.
- `pocketGiftFunding.ts`: exact-allowance ERC20 approval and gift funding calldata using the shared fee helper. This is not a final network fee quote and is not connected to production wallet execution.
- `pocketGiftSigning.ts`: capability generation and canonical parsing, typed-data construction and local signature generation. No network calls, logging or persistence.

Validation:

- 19 local Hardhat tests pass: atomic funding, fee accounting, sender-scoped IDs, forwarded claims, duplicate claims, recipient substitution, wrong key/domain/gift/deadline, expiry, refunds, fee-on-transfer rejection, blocked treasury/recipient/sender recovery, competing claims in one block, aggregate outstanding principal.
- `node --import tsx scripts/pocket-gift-signing-smoke.mjs` passes signature binding, invalid code rejection, cross-library typed-data agreement, exact approval/funding calldata and shared fee rounding.
- TypeScript checks for gift files: zero diagnostics.
- Test command (from `contracts`): `npx hardhat test --config hardhat.gifts.config.ts test/PocketGiftEscrow.test.ts`.
- Tests use an isolated Hardhat network and local solc 0.8.26/Cancun. No production env, deployer keys, mainnet RPCs or real funds are used. Deployment must separately verify chain/EVM compatibility and canonical USDC.

Still required:

- Independent security review and validated deployment config, including token and treasury ownership. Local tests are not a security certification.
- The bearer credential can be used by any holder, including the creator. Keep the existing bearer warning; do not promise an exclusive recipient before claim.
- Public drops are not implemented by this single-recipient contract. Do not reuse one authorization key to present a multi-recipient campaign as protected from duplicate identities.
- Authenticated, rate-limited backend; canonical gift metadata and onchain reconciliation; sponsored claim submission/retries with idempotency; receipt/activity integration; real wallet approval and recovery.
- Secure onboarding continuation and store-install recovery. No automatic install restoration is claimed.
- Stablecoin issuer freezes or transfer restrictions can block a claim/refund. Tests confirm failed transfers leave the gift recoverable, but the app must show the actual reason and wait for resolution.

Design references checked: OpenZeppelin EIP712/ECDSA and SafeERC20 documentation (https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography and https://docs.openzeppelin.com/contracts/5.x/api/token/erc20). Installed dependency version is pinned by the existing contracts lockfile. New gift code does not activate or reuse legacy payment vaults.

No production deployment or Pixel installation was performed for this checkpoint.

## Backend and wallet checkpoint — 2026-10-01

Implemented locally:

- Authenticated creation and wallet authorization routes with read/write rate limits. Durable per-gift Postgres records use row locks for idempotent creation and attempt reservation.
- Confirmed observations verify chain, pinned contract runtime, token, treasury, fee and gift fields. Canonical block checks reject inconsistent observations; a transaction hash alone never establishes success.
- Recipient-bound claim signatures are created locally. Public responses exclude authorization metadata and signatures; the bearer credential is not sent to the backend.
- Circle smart-wallet batch adapters prepare funding, claim and refund challenges. The app adapter uses existing Circle approval. Preparing a challenge never marks a gift funded or paid.
- Timeout/crash recovery reuses provider idempotency keys. Replacement claim authorization waits until confirmed chain time exceeds the old signature deadline. Late retry errors cannot overwrite recovered approval.
- Claim confirmation requires evidence for the authenticated recipient. Bounded event lookup supports a validated receipt fallback.

Validation:

- Backend smoke checks passed: ownership, concurrent reservations, timeout and expired authorization recovery, response privacy, contract pinning and reorg rejection.
- Wallet adapter checks passed: local signing, recipient validation, non-JSON failure handling and verified completion only.
- Local end-to-end passed: smart-wallet funding, confirmed availability, claim and exact recipient credit; a separate expired gift returned principal to the sender. Circle approval was simulated. No production funds moved.
- End-to-end testing caught stale RPC block-number caching after funding; the observer now requests the current head without that cache.
- Changed-file TypeScript diagnostics: zero.

Launch work still required:

- Independent contract review, reviewed deployment registry and verified treasury/token configuration. Production deployment registry remains empty.
- Live Circle approval, sponsorship and final network-fee economics; authoritative recovery for cancelled or expired funding challenges.
- App UI connection, secure creator credential persistence and authentication/install continuation.
- Scoped activity and receipts. Public drops and Solana gifts are outside this single-recipient EVM implementation.

This checkpoint is not a live gift service or security certification. Nothing was deployed or installed on Pixel.

## Connected claim UI checkpoint — 2026-10-01

- Added a connected gift landing/claim integration component using the backend reader and Circle wallet adapters. It is not mounted in live Pocket routes yet.
- Separate preparation, wallet approval, status checking, unconfirmed and verified-success states. A hash alone never renders success. Duplicate taps cannot start another approval; interrupted approvals offer status checking.
- Public gift loading uses a shaped skeleton and validates metadata identity before display. The component retains redeem intent across in-place authentication while mounted; this is not store-install or full-reload recovery.
- Retains only an account-scoped public gift attempt marker in sessionStorage. Bearer capability stays out of that storage and API payloads. Callback changes do not restart a pending approval, and changing identity/link disposes the previous controller.
- Smoke tests passed for duplicate taps, hash-only results, timeouts, recipient-specific outcomes, missing confirmation evidence, disposal and HTML outage handling. Existing backend checks still pass; changed-file TypeScript diagnostics are zero.
- Playwright rendered check passed using mocked metadata/authentication and a deliberately unavailable wallet: sign-in continuation, non-dismissal on outside tap, and preparation retry without false success. Screenshot saved locally; image inspection tool failed due to sandbox helper error.

Remaining: production route/native deep-link binding, secure creator capability recovery, authoritative cancelled-approval recovery, sender funding UI, receipts/activity, reviewed deployment and live Circle sponsorship. No production deployment or Pixel installation.

## Gift route and bridge release — 2026-10-01

- Gift URLs now have a dedicated Pocket host route. Native users retain the gift through the existing in-place email sign-in sheet and open the network-specific Circle wallet for redemption.
- Browser redemption opens the registered Pocket scheme. Installation fallback uses the existing configured store link and explicitly asks users to reopen the original gift link after installation; no deferred-install restoration is claimed.
- Gift funding remains unavailable: the reviewed deployment registry is empty. Sender funding/recovery, deployment, live sponsorship, and gift receipt/activity integration remain launch requirements. This release does not claim gifts are production-ready.
- Bridge release: menu list replaces the mode tabs, active inputs lock, technical copy is reduced, and saved no-hash approvals can reconcile read-only with cached sessions. Both bridge legs and both swap legs fold into their parent activity using exact chain/hash references. Push tests verify one scoped bridge/swap notice.
- Scoped bridge, activity, Arc swap and gift checks pass. Android build succeeded. No real money transfer was initiated during these checks.

## Base sender and full manual bridge network list — 2026-10-01

- Base sender saves capability and draft in existing native secure credential storage, verifies read-back before funding, and keeps only account-scoped request IDs in the public index. Retries reuse the original draft and provider idempotency key. Share link appears only after confirmed funding; expired gifts can request the existing refund flow.
- Send/Receive gift entries are readiness-gated. Production deployment registry remains empty and funding review flag is false. No deployment, funded gift, or live sponsorship is claimed. Remaining launch requirements: reviewed contract deployment/treasury, Circle sponsorship and final network-fee economics, authoritative cancelled-approval recovery, scoped gift activity/receipts, and live end-to-end testing.
- Manual bridge selectors share one six-network catalog: Base, Arbitrum, Arc, Solana, Ethereum, Polygon. Saved Ethereum/Polygon selections and approval labels now remain correct. Automatic payment top-ups retain their separate Ethereum exclusion. Asset swaps remain Arc-only.
- Tests cover all 30 directed bridge quote combinations with injected provider responses, network labels/persistence, bridge recovery, Solana ownership checks, Ethereum/Polygon proof domains and USDC mints, secure gift storage failures, duplicate funding taps and backend recovery. These tests do not establish live paid execution on all routes.

## Gift recovery and receipt evidence — 2026-10-01

- Cancelled/failed funding recovery now checks the owner-linked Circle challenge and confirmed contract state. Only a provider-terminal failure without a transaction hash, plus an unfunded unexpired gift, unlocks another funding approval. Timeouts retain the existing attempt. A row-locked attempt identity check prevents late responses from resetting newer approvals. Read-only chain status is checked before requesting a wallet session.
- Funding/refund events now retain canonical transaction hashes and block timestamps after checking the gift amount, fee, signer, sender and expiry. Claims retain their own settlement timestamp. State alone cannot create a successful receipt.
- Confirmed gifts publish account-scoped activity records through the existing durable action journal. A refund updates the sender gift record; exact-chain underlying funding/refund transfers are hidden from duplicate activity. Recipient receipts require the verified claim address to match the authenticated claim attempt. No bearer credentials or signatures enter receipt metadata.
- Tests pass for recovery ownership, concurrent retries, late failure responses, confirmed event evidence, fee visibility, recipient isolation, refunded receipt updates, and existing Pocket activity/receipt/bridge regressions. Changed-file TypeScript diagnostics: zero before final read-first adjustment; funding smoke rerun afterward.
- Still gated; no mainnet deployment or gift funding. Launch work remains: independent review, deployment/treasury/sponsorship checks, live end-to-end tests, background reconciliation when the app is closed, and complete expired-unfunded draft handling. Historical event recovery currently uses persisted hashes or a recent 2,000-block event window; interrupted sessions beyond that window need provider transaction recovery before release. These are not production readiness claims.

## Background recovery and deployment preflight — 2026-10-01

- Added a deployment-gated background worker with a cross-process Postgres advisory lock, bounded ten-record batches, persisted scheduling, failure isolation and slower polling for idle gifts. It never signs or submits transfers. Drafts with no funding attempt do not consume background RPC calls.
- Event verification now resumes from a persisted block cursor in ranges of at most 2,000 blocks. A reviewed production manifest requires the deployment block; older funding/claim/refund evidence is no longer limited to the most recent window. Terminal reconciliation requires verified hashes and receipt timestamps, after receipt publication succeeds.
- Expired unfunded saved drafts have a distinct sender state and cannot offer refund approval. Public gift status becomes expired only from confirmed chain time; unsent local drafts expire without an API funding attempt.
- Gift journal updates preserve unchanged timestamps. Late funded snapshots cannot replace claimed/refunded records or change their bound transfer details.
- Added read-only Base deployment preflight and manifest validation: chain 8453, native USDC, treasury, pinned runtime hash, two or more confirmations, deployment block, 6 decimals and 25 basis points. It does not deploy, sign, expose keys or prove Circle sponsorship.
- Tests passed: background worker, historical scan resume, expired draft states, journal idempotence, deployment preflight fixtures, backend recovery, funding, receipts, and local smart-wallet funding/claim/refund end-to-end. Circle approval was simulated and no production funds moved. Changed-file TypeScript diagnostics: zero.
- Remaining live launch dependencies: permanent fee treasury and deploying wallet addresses, contract review/deployment and bytecode verification, live Circle sponsorship/approval and fee economics, and a controlled mainnet funding/claim/refund test. Production registry remains empty; funding remains false. No claim of a live gift service.

## Confirmed treasury and live deployment estimate - 2026-10-01

- User confirmed platform treasury `0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753` for the immutable 25-basis-point gift fee. Recorded in `contracts/pocket-gift-base-plan.json`; this is a preparation plan, not a deployed-contract manifest.
- Added `scripts/pocket-gifts-circle-estimate.mjs`. It verifies the configured live Base SCA and wallet set, validates the plan and constructor, and calls only wallet lookup and deployment estimate APIs. Credentials stay on the backend. It cannot sign, deploy, change policy or activate gifts.
- Live estimate with confirmed treasury succeeded: gas limit 2,555,474; medium max fee 0.012043411 Gwei. Bytecode SHA-256: c918b99c7967ba6948235826a3039ed505f8429196b980111f48fa50a6a0823d. Time-sensitive estimate does not establish sponsored execution.
- User-provided Circle Console evidence shows Base active/default, $50 daily spend, $2 per transaction and 1,000 daily transactions, with prior sponsored transactions. This is not proof of deployment sponsorship or current remaining quota.
- All 19 contract tests and deployment smoke checks passed again. No production transaction submitted. Remaining: contract review, controlled deployment and bytecode verification, live funding/claim/refund approval and sponsorship validation before enabling gifts. Treasury selection is no longer outstanding.

## Internal review fixes - 2026-10-01

- Internal Solidity Auditor review adapted to three reviewer slots grouping twelve lenses. Not an independent external certification. No proven contract theft, replay, double settlement or accounting defect under canonical exact-transfer USDC assumptions. Token authenticity, issuer restrictions, bearer possession and nonrefundable creation fees remain explicit design/deployment assumptions.
- Confirmed high-impact integration finding while feature is gated: forwarding the bearer via generic pocket:// can expose it to another registered app handler. Changed gift opening to canonical HTTPS; no generic-scheme fallback. Android/iOS associated-domain declarations exist, but actual device handoff and hosted association verification remain required. Same-origin browsers may retain the page.
- Fixed cancelled/timed-out claim recovery: server explicitly permits retry only for the same claimant/wallet, while available, after confirmed chain time strictly exceeds the prior signature deadline. UI resets and clears its marker only on that authoritative result. Unknown/in-flight operations remain status-only and never automatically repeat approval.
- Pinned deployment bytecode SHA-256 in the preparation plan; mismatched artifacts fail before accessing Circle.
- Passed backend recovery, claim UI, canonical gift-link and artifact tamper checks; changed-file TypeScript diagnostics zero. Solidity unchanged; prior 19-test contract suite remains applicable.
- No contract deployment, public gift enablement, live gift payment, web deployment or Pixel installation in this checkpoint. Remaining launch checks: device HTTPS handoff, controlled contract deployment and bytecode verification, real approval/sponsorship, funding/claim/refund execution.

## Base deployment and Android links - 2026-10-01

- Deployed PocketGiftEscrow through the existing verified Circle Base SCA. Contract: 0x88cff40dcfc7316bad0809969a1a15c19c523441. Transaction: 0x5b90e99276f14f812dfd4b0f41ae3c0f26e7372b67dd01dfdc4be761a556b274, block 52026892. Circle contract 01a0f691-4dcd-718d-9671-96e9aaeeba61; transaction 9c22bc63-b74a-5ad9-a6a4-2bd53e4f8698. Both reached COMPLETE. Stable deployment idempotency key a1ae7903-d56b-4746-9a78-e840f62ec33d must not be replaced to retry this deployment.
- Initial requests were rejected for description formatting; Circle currently requires blockchain alongside walletId despite contradictory reference wording. Accepted request used Base, alphanumeric description, exact pinned bytecode and confirmed constructor values. A Render rollout interrupted the first SSH response; read-only reconciliation preceded same-key recovery. No duplicate deployment was created.
- Onchain success confirmed. Runtime matches compiled bytecode outside compiler-declared immutable slots. Token, treasury, 25bps and zero totalLocked verified through getters; claim digest matches expected Base EIP712 domain. Runtime hash and deployment evidence saved in contracts/pocket-gift-base-deployment.json. This file does not activate the registry.
- Matching EntryPoint UserOperation event has success=true and nonzero paymaster 0x7ceA357B5AC0639F89F9e378a1f03Aa5005C0a25. Actual gas cost: 13107376067760 wei. Gas sponsorship is proven for this deployment, not yet for future funding/claim/refund operations. No gift principal funded.
- Fixed missing live Android association configuration using the installed Pocket certificate, preserving other entries. Both pocket.hashpaylink.com and app.hashpaylink.com now verify on Pixel. This certificate belongs to the current debug app; Play Store release certificate must also be configured before store launch. iOS association remains unverified.
- Web fixes through 1f474c951 are live (Render dep-dav1btrncjis73d38060). Native build completed; Gradle BUILD SUCCESSFUL and Pixel adb install -r succeeded, preserving data. Restored only generated tracked build files afterward.
- Gifts remain disabled pending real wallet funding, claim and expiry-refund tests and their scoped receipt/recovery checks. Do not infer user-facing readiness from deployment alone.

## Controlled Base gift lifecycle - 2026-10-01

- Completed two controlled mainnet gifts of 0.01 USDC each through the verified developer-controlled Circle Base SCA. Exact initial debit: 0.02005 USDC; combined 25bps creation fees: 0.00005 USDC to the configured treasury. Funding transaction: 0x1c4cca8fe9ac9467e400483abbaf6a0d831fa31258b6f7fa5b55ccaa73c4b4d3.
- Claimed the first gift to the configured treasury, receiving the full 0.01 USDC. Claim transaction: 0x013cdda946e0fa7dc3634140bc078d02c263329ab148f3f85d780eac5121ef83.
- Refunded the second gift after confirmed chain expiry, returning its full 0.01 USDC principal to the original sender. Refund transaction: 0x323dd88bab79a8b0f6a45aceaf194e9de5d18428144a6fc9227f4393c8f5b1e6. Creation fee remains nonrefundable by design.
- Verified successful receipts, canonical USDC transfers, gift events and matching successful sponsored UserOperation events for funding, claim and refund. Final gift states: claimed and refunded; totalLocked=0 and remaining sender allowance=0. Read-only simulations rejected duplicate claim, refund of a claimed gift and premature refund.
- Production chain observer and receipt builders checked against these real transactions using in-memory records: Gift sent / Gift received for claim; existing sender entry becomes Gift refunded with refund hash. No synthetic activity was written to user accounts. Public transaction journal preserved locally in ignored .codex-temp/gift-live-test-journal.json; no credentials or claim private keys in journal.
- Scope limitation: these tests use Circle developer-controlled execution. They do not establish the end-user Pocket PIN/Circle approval flow, persisted account activity or installed-app claim UX. Public deployment registry remains empty and funding review flag false pending those checks. Existing Pixel installation is unchanged by this backend test.

## Restricted installed-app pilot preparation - 2026-10-01

- Registered only the verified Base deployment. Public gift funding stays disabled. POCKET_GIFT_PILOT_USER_IDS grants funding access only to exact authenticated immutable user IDs, capped at 0.01 USDC per gift. Empty configuration grants nobody access. Do not configure editable Pocket handles as IDs.
- Configuration requests may include authentication to expose only the caller's eligibility. Both gift creation and funding authorization independently recheck membership, amount and network; revoking access also blocks saved unfunded drafts. Existing claim/refund recovery remains available so rollout changes cannot strand funded gifts.
- Gift menus and sender page now read authenticated configuration. Account changes clear previous eligibility. No bearer gift capability enters this configuration request.
- Backend, funding, claim-controller and deployment smoke checks passed, including pilot access, cap, network and revocation tests. Focused ES2022 TypeScript diagnostics: zero. Mobile Vite build completed successfully.
- Live end-user PIN/Circle approval, persisted receipt and installed-app redemption remain untested. Account selection is pending; no pilot account has been enabled in this checkpoint.

- Release result: d4187da31 is live on Render (dep-dav29dm0tbcc73eaoqa0). Readiness API returns HTTP 200 JSON with sendEnabled=false and claimEnabled=true. A transient 502 during instance replacement cleared after rollout; no unresolved outage observed in the final check.
- Android Gradle build succeeded; Pixel 5A160DLCH006VM install -r returned Success, preserving app data. Restored only generated tracked dist/Gradle files; unrelated XPay changes remain untouched. Pilot account selection and user approval are still pending; no additional money moved in this release.

## Pixel pilot: persisted deployment comparison fix - 2026-10-01

- User confirmed @shy. Resolved its immutable authenticated account ID and Base wallet link; configured only that ID in POCKET_GIFT_PILOT_USER_IDS. Live rollout dep-dav2k5l9fdbs73b06nj0 verifies pilot sendEnabled=true and public sendEnabled=false.
- Pixel Send menu exposes Send a gift. Created one 0.01 USDC draft, g_BcdIOxjXfyy13-rgIpuULT. Review shows fee 0.000025 USDC and total 0.010025 USDC. No Circle challenge or funding hash exists; no money moved.
- Actual-device review exposed a backend defect: owner-status rejected a valid deployment because PostgreSQL JSONB reordered object keys. Live diagnosis proved all eight pinned field values equal while JSON.stringify comparison failed, returning Gift network is not enabled.
- Replaced serialized-object comparison with explicit equality of all eight pinned deployment fields. Regression covers reordered keys and rejection of each changed field. Resume the existing draft after rollout; do not create/fund another gift. Real end-user approval and redemption remain pending.

- Fix verified live on Render dep-dav2p5bncjis73d54et0 (abdd6aaba). Existing gift lookup now returns HTTP 200. On Pixel, retrying the same draft replaced Check status with Fund gift and preserved the 0.010025 USDC total.
- Tapped Fund gift once for the authorized test. Pixel is now at Enter your PIN to approve; no PIN entered by automation. Awaiting the user's on-device approval, then Circle approval and confirmed funding/claim verification. Do not create another draft or submit a backend substitute transaction.

## Automatic gift confirmation and scoped pushes - 2026-10-01

- Pixel funding succeeded after the user's approval: 0.01 USDC gift g_BcdIOxjXfyy13-rgIpuULT is available, confirmed funding hash 0x716559b68370222522d4c28208678803e459cdd935d2c51ebab2884d23f06859. The manual status check revealed the ready-to-share QR; the delay was frontend refresh, not a missing payment. Claim remains untested.
- Funding and claim sheets now refresh pending outcomes automatically using single-flight read-only checks with 2.5s initial delay and up to 15s backoff. Quiet reads preserve the sheet without loading flicker. Visibility/offline pause, focus/online resume and disposal prevent redundant checks. No automatic wallet approval or transaction resubmission. Pending CTA is Done; backend reconciliation continues when the sheet closes.
- Funding retry can reopen only after the server verifies a terminal failed approval with an unfunded contract. Quiet recovery uses an already available Circle session and cannot summon a wallet-login popup.
- Confirmed gift pushes now say Gift funded / Your [amount] USDC gift is ready to share. Received and refunded gifts have their own wording. Gift principal, fee and refund transfer hashes suppress duplicate generic money pushes, including when activity context lags behind the action journal. Normal USDC send fee-grouping regression verifies one principal-only push.
- Auto-refresh lifecycle, funding/claim controllers, scoped push worker and notification wording tests passed. Changed-file ES2022 TypeScript diagnostics zero. Mobile update and deployment in progress at this checkpoint.

- Release d5290dcd1 is live on Render dep-dav35hc9v7es73bulm0g. Mobile Vite build succeeded (4m20s), Gradle BUILD SUCCESSFUL, Pixel install -r returned Success. App data and saved gift retained; generated tracked files restored.
- Updated Pixel reopened Gift 1 directly to its ready QR without manual status action. Copied gift link on-device and pasted into Claim a gift without printing the bearer capability. Landing correctly shows 0.01 USDC on Base from @shy.
- Started one self-redemption test for the same gift. Backend record remains available with claim phase awaiting_approval, challenge present and no transaction ID/hash. UI automatically polls in place and shows Confirmation pending / Done, no Check status. Claim is NOT confirmed. User was asked whether Circle's claim approval appeared; await answer and reconcile before any repeat approval. Funding hash remains 0x716559b68370222522d4c28208678803e459cdd935d2c51ebab2884d23f06859.

## Gift claim Circle fragment collision - 2026-10-01

- User confirmed Circle approval never appeared. Pixel inspection found a hidden sdkIframe at /social/verify-token, not the claim approval page.
- Installed Circle SDK 1.1.11 treats any key=value URL fragment as an OAuth response. Pocket's gift capability fragment matches that pattern; SDK construction consumed it and created the hidden social verification frame. The existing approval guard then correctly refused a second frame.
- Added createCircleSdk for all Pocket EVM/Solana constructors. It temporarily hides only a valid Pocket gift capability fragment during synchronous SDK initialization, restores the URL and router state, and leaves real OAuth URLs and concurrent-approval protection unchanged. No bearer data is logged or persisted by this helper.
- Claim approval errors retain automatic read-only reconciliation but now truthfully say wallet approval did not finish. No retry or confirmation is inferred from that error.
- Real installed SDK browser regression reproduces the original collision, proves gift and singleton construction are protected, and verifies OAuth handling remains unchanged. Unrelated JWT decoding is stubbed in that constructor-only test. Existing Circle approval surface/handoff and gift claim controller regressions passed; changed-file TypeScript diagnostics zero.
- Pixel build in progress. Same funded gift remains the only user test; no new gift, no additional funding, and no confirmed claim at this checkpoint.

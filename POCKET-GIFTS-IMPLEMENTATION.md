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

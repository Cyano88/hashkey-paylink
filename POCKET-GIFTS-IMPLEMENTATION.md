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

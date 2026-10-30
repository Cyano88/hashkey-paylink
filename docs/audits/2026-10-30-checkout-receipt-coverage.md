# Checkout receipt coverage - 2026-10-30

## Change

Human hosted Checkout receipts now share one verified server record for web, PDF and email across Base, Arc, Arbitrum, Ethereum, Polygon, Solana, X Layer and BNB Chain. The record supplies the actual asset, amount, payment network, payer, merchant and selected recipient. This does not enable new payment rails or stock payments.

- Wallet payment remains the payer's method when the merchant receives NGN bank or UGX mobile-money settlement. Local settlement is a separate receipt detail.
- Success/PDF/email requires confirmed payment and successful required local delivery. Pending, failed and refunded payouts cannot generate a successful receipt.
- BNB has public receipt lookup and completion-page receipt recovery.
- Existing signed ordinary-checkout receipt aliases remain valid, including dotted identifiers. Lunchroom accepts those links. Standard checkout IDs also recover the canonical receipt.
- Receipt emails no longer require X Layer acceptance or stablecoin-only merchant settlement. Agentic, suspended, removed and disabled projects remain ineligible.
- The pre-payment contact endpoint authenticates Privy, verifies ownership of the selected wallet/network and saves only the verified server email. Client-supplied email is ignored. Contacts cannot be added after payment. Reconciliation checks actual payer/network/project and enable time.
- Existing durable email jobs preserve idempotency, immutable retry payloads, leases and the provider retry cutoff. X Layer's existing receipt capture remains compatible.
- Public receipt JSON does not expose the captured email. PDF download reuses the frozen email attachment when present.
- Shared method labels support wallet/card/bank representation; no current checkout is falsely relabeled as a card or customer bank payment.

## Verification

Fixture suites cover all eight network adapters, selected-recipient routing, local delivery states, signed aliases, Solana case-sensitive transaction binding, verified-email capture, ownership rejection, immutable contact and reconciliation exclusions. Existing outbox, PDF, email presentation, project settings, local settlement, merchant status and webhook tests are included.

Playwright checks receipt presentation at 320/390/1280 in light/dark themes, correct states, reference copying and canonical PDF download. Checkout card checks verify authenticated contact registration precedes explicit payment and duplicate taps do not duplicate payment. NGN/UGX PDF fixtures were rendered and visually inspected as single-page documents.

## Limits

These are fixture and browser checks, not a new funded transaction on every network. A new paid checkout and actual email delivery on a non-X-Layer network remain to be verified. The Pixel native checkout repository has not been rebuilt or shipped by this change. Existing non-hosted Pocket transaction receipts are preserved.

No merchant settings were saved, funds moved or real customer emails sent during verification. Existing unsaved developer settings tabs were preserved. Unrelated billing work and generated dist files are excluded from the release.

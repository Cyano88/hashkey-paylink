# Checkout method chooser and Pocket handoff - 2026-11-02

Release candidate: Stablecoins is active. Card, Google Pay, Apple Pay and Bank transfer are disabled Coming soon rows. Official unmodified wallet identity assets and provenance are under public/brand/payments. The neutral stablecoin symbol represents a category, not an approval badge. Existing stock-specific XPay choices retain their separate presentation.

Hosted flow: payment method, Pocket/web choice, then network/asset review. The method list is not repeated in the later selection screen. Native multi-option checkout links open a selection sheet and preserve the selected child checkout and attempt. Explicit selection is required; opening a link never submits a payment. Android intent fallback preserves the checkout and offers retry or a validated Play listing/testing URL when configured. No guessed store URL.

Expiry wording: Payment session expired. Start a new checkout. Return action: Go back. Existing 15-minute default and server expiry remain unchanged. Already-submitted payments continue status checks.

Validation: production source build; focused chooser TypeScript; existing handoff, QR parsing, public checkout, routing, token/network selection, browser card, X Layer expiry and app fallback checks passed. New native-sheet browser fixtures cover 320/390 light/dark, nested Back, duplicate taps, hostile child URL rejection, exact attempt preservation, expired disablement and Close. Browser fixtures do not establish an installed-device or funded-payment result. Whole-repository TypeScript stalled and was stopped; it is not recorded as passing.

Android candidate version is 1.0.5 (6). Packaging must use the scoped commit in an isolated checkout. Play version availability remains to be checked before upload. No Play publication or replacement of the working Pixel installation is authorized by packaging alone. Unrelated billing, retirement and store-listing edits are excluded.
# XPay shared checkout audit and implementation scope — 2026-11-16

## Accepted product structure
One merchant QR opens the shared payment journey. Pocket is preferred; a web checkout remains available. A single Open Pocket action offers Get Pocket only after an unsuccessful handoff. The merchant identity and payment context remain visible. Creator acceptance, payer funding source and merchant settlement are separate concepts.

Reusable terminals accept a customer-entered amount; fixed orders bind their amount and currency to a server-created payment session. Each payment gets an independent session: a reusable QR is not itself a paid order. Supported configured methods are selectable; future methods are disabled. Existing terminal URLs and historical payment recovery must survive migration.

## Verified current gaps
- Unified XPay stores terminal identity, owned destination IDs, destination revisions and setup keys. Public reads revalidate the destination revision; payment adapters revalidate the destination before paying. Preserve these checks.
- Stablecoin receiving currently binds Circle-owned wallets on Base, Arbitrum, Arc, Ethereum, Polygon and Solana, but is USDC-only. This is not the full online-checkout network/asset catalogue.
- XPay destination kinds mix bank settlement and crypto receiving. They are not payer funding sources. Cash balance cannot safely be enabled by adding a UI flag or calling the personal-withdrawal route.
- Online checkout selections already support authenticated stablecoin/cash choices, child sessions, atomic payment locks, idempotency and verified result projection. Their current cash path is tied to eligible NGN orders and merchant settlement. A terminal-to-checkout adapter must bind the same fields before cash is enabled for XPay.
- Pocket scanning previously required a method query parameter even for an otherwise valid unselected online checkout QR. This prevented scan-first choice inside Pocket.
- Existing X Layer/stock compatibility routes are not a generic new XPay rail. Preserve historical recovery and receipts; do not revive retired offerings.

## Limits and boundaries
- Online and physical QR purchases share USD 7,000 per payer per UTC day; Basic verification is required by the shared purchase ledger. No separate XPay daily allowance.
- Personal transfers remain separate: Basic USD 50 and Advanced USD 7,000 daily. Merchant withdrawals remain settlement operations governed by released funds and accepted quotes; do not charge them to payer purchase allowance.
- Every enabled network/asset and cash route must reserve the same purchase ledger before signing or transfer; switching routes must not create a second spend path for the same order. Unknown/in-flight results must reconcile before retry.
- Per-payment maximum is bounded by remaining purchase allowance, merchant acceptance and any applicable provider quote/capacity. Quote expiry and fees are shown before approval. Provider changes must not silently increase a previously approved debit.
- Existing creator controls (20 active terminals, setup-key bounds and three accepted assets across destinations) are resource/configuration limits, not daily payment allowances. Replace the three-asset model only together with validated per-network acceptance and backward-compatible persistence; do not remove it alone.
- Existing QR request protection is separate from money limits: authenticated write/read buckets, public discovery IP protection and route-specific protections. Preserve them. Current fixed-window storage is per-process, not distributed.

## First implementation
- Valid unselected online checkout QRs now open payment methods directly in Pocket without requiring a prior browser choice.
- Shared native chooser shows merchant and amount before method selection, keeps future methods disabled, respects explicit server method availability and blocks unsupported cash selection.
- Existing selected/in-flight checkout resume is preserved. Back from the first method sheet exits cleanly; preparation uses a shimmer.
- Targeted edits mirrored into native source. No payment/enforcement backend change, no fabricated XPay cash capability and no new merchant configuration enabled.

## Next implementation slices
1. Versioned terminal acceptance schema and stable server-created per-payment sessions; retain destination revision binding and legacy QR lookup.
2. Connect terminal sessions to shared checkout selection/payment locks and purchase allowance, with cash enabled only for verified supported settlement combinations.
3. Creator network/asset and cash controls; payer source-first UI, fixed/reusable amount handling, consistent receipt branding and audience.
4. Shared web/app entry and explicit fallback; test app installed, missing, disabled app links, return after installation and expired sessions.
5. API/browser regression plus Pixel creator/payer walkthrough before deployment. A new live money test must be distinguished from fixtures; deferred real document KYC stays out of this work.

## Validation of the first implementation
- Real scanner plus shared chooser browser fixture passed at 320px/390px in light and dark themes: methodless QR, merchant/amount context, cash and network/asset selection, disabled future methods, duplicate-click protection, Back, unavailable method rejection, existing-child resume and expiry.
- Existing QR allowance regression passed: shared online/QR cap, cross-rail concurrency, provider capacity, Basic KYC, harmless previews, retries/refunds, separate Personal ledger and UTC reset.
- Existing scanner browser regression passed, including actual QR-frame decoding, hostile QR rejection, camera lifecycle and authoritative read-only lookup.
- Focused web diagnostics passed (18 files); native diagnostics passed (29 files). Mobile screenshots inspected.
- These are source and isolated fixture results. This initial slice is committed for continued implementation, not yet deployed or installed on Pixel. No payment or production terminal was created or changed.
- Merchant onboarding verification is distinct from payer Basic KYC. Existing guidance about wallet-only merchant activation before merchant verification must not be interpreted as a payer purchase-limit exemption.

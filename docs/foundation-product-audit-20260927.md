# Foundation product audit - 27 September 2026

Scope: public Foundation page and its search/social description. No wallet, payment, API or mobile execution code changed.

## Evidence and resulting copy

- Pocket: `src/pocket/lib/pocketRoutes.ts` exposes Stablecoins, XStocks, XPay, Bills, requests and Support. `src/pocket/lib/pocketSchemas.ts` lists Base, Arbitrum, Arc, Solana, Ethereum and Polygon. Wallet network coverage is not advertised as universal checkout or bridge coverage.
- XStocks: `api/pocket/xstocks-swap-provider.ts` validates OKX DEX routes on chain 196. `src/lib/xstocksAgreement/xStocksCatalog.json` supplies existing asset names and images. The website does not show invented prices or holdings.
- XPay: `api/pocket/unified-xpay.ts` and `unified-xpay-store.ts` bind each business terminal to its own receiving options. Terminal QR and aggregate histories retain their own scopes. Copy describes bank/mobile money, USDC and selected stock options without claiming every asset or route is available.
- Local payouts: `api/ng-pos.ts` and Pocket bank fields support NGN and UGX. The supervised Uganda flow was verified in this working session's prior payment work; no new payment was made for this page audit.
- Bills: the active bill routes cover airtime, data, TV and electricity. The old pilot label was removed; no claim is made that every provider is continuously available.
- Support: `api/pocket/support-conversation.ts` calls `pocketSupportAnswer` and provides human handoff. No ZeroScout call was found in current Pocket Support. Removed the old external-intelligence claim.
- App Pay: `PocketX402Page.tsx` and supporting code exist, but the component has no current route/import caller. Removed its dead public product CTA. This does not remove configured developer agent checkout.
- Developer contract: live GET `https://hashpaylink.com/api/v2/capabilities` returned version 2. Human checkout: Base, Arbitrum, Arc. Agent checkout: Base, Arc. Arc Agreements: draft-only. XStocks Agreements and swaps: activation required. Public bridge API: unavailable. Sandbox payments and keys: disabled. The Foundation links to this contract and does not advertise these as universally enabled.
- 0G: `api/og-storage.ts` and `og-archive-proof.ts` archive eligible records separately from payment settlement. Removed universal durable-proof claims. 0G Compute is described only as infrastructure builders can use for their own AI features.
- Arc: current code/docs use chain 5042. Official network reference also identifies mainnet 5042: https://docs.arc.io/arc/references/connect-to-arc . Removed the contradictory Testnet badges from mainnet illustrations.
- Stock product description checked against https://web3.okx.com/learn/earn-xpoints-xlayer . Tokenized stock exposure is not described as direct share ownership.

## Reference and layout

Reference: Pictures/Screenshots/Screenshot 2026-09-27 160328.png. Reused the white ending, thin divider, spaced ecosystem marks and copyright treatment. Its regulatory/insurance assertions are not Hash PayLink assertions and were not copied.

Footer includes support@hashpaylink.com, Hash_PayLink and PocketByHash on X, product/developer links, terms and privacy. Circle, Arc, 0G Labs and X Layer each have a specific infrastructure role. X Layer uses its name rather than an invented logo.

## Validation

- Browser visual inspection: desktop footer and dedicated XStocks section; mobile footer and lower-link reachability.
- Responsive checks at widths 320, 390, 768 and 1440; no horizontal page overflow; footer links reachable at height 700.
- XStocks catalog images load successfully.
- Focused TypeScript check reports the same pre-existing missing lucide-react declaration diagnostic on unchanged HEAD and the updated file. No new page diagnostic observed. No whole-repository typecheck claim.
- Production build and deployment results are recorded in the delivery response.

## Follow-up: theme isolation, plain language and ecosystem projects

- Reproduced the live dark-theme failure: footer background rgb(30,30,30), main text rgb(2,6,23), muted text rgb(85,85,85). Generic application dark-mode utility overrides were recoloring the marketing page.
- Added a DOM-scoped Foundation marker and excluded it from those generic overrides. The saved theme preference is unchanged; other application routes retain the original dark styling when Foundation is absent.
- Simplified hero, product, provider and developer language. Added FAQs explaining the payment steps Hash PayLink combines, what USDC can do, overseas stock-token exposure, developer onboarding, and actual timing/product limits.
- Added Projects building on our rails. Hash PayStream public page (https://hashpaystream.app) currently says payments, work and trade, including USDC and XStocks; used that instead of older savings/early-pay README wording. PolyDesk live manifest (https://polydesk.trade/.well-known/polydesk.json) and current README identify app/agent Polymarket services, with Hash PayLink as the funding checkout and payment-receipt boundary.
- Repeatable test: `node scripts/foundation-theme-browser-smoke.mjs`. It checks 45-47 CTA/footer text elements against 4.5:1 contrast in light and dark at widths 390, 1024 and 1440; no horizontal page overflow; original dark utility behavior outside Foundation; every FAQ expands; project URLs; mobile footer reachability. All passed.
- Visually inspected corrected dark-setting footer and ecosystem cards. This page intentionally preserves the reference's light surfaces under both app theme settings.

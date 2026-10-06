# Checkout consolidation release review — 2026-10-06

Status: release candidate prepared on top of production commit 343f4b46c. Stock checkout activation remains disabled. Deployment verification is recorded separately after release. No live payment, conversion or wallet signature was performed.

## Scope

- Developer navigation exposes Checkout, Agreements and independently configured Swap.
- Human projects can configure accepted X Layer assets and an X Layer recipient alongside their existing USDC routing. This does not enable stock-to-bank settlement or a stock-only project without ordinary routing configuration.
- A separately activated human checkout uses `POST /api/v2/checkouts` with `rail: "xlayer"`, an accepted asset and a string token quantity. Fixed token quantities remain immutable.
- Browser mobile uses Pocket's bottom sheet; desktop uses a centred card. The existing Pocket wallet session and XPay payment execution are reused.
- Optional checkout conversion requires both project Swap capability and wallet:swap key scope. Conversion and merchant payment require separate customer approvals. Existing Agreement conversion integration was not expanded in this change.
- Polymarket funding remains a separate USDC flow. Stock checkout cannot be used as a funding route.
- Developer-owned balance cards/pricing integrations are documented with their own OKX credentials and RPC. Hosted customers do not supply those credentials.

## Verification completed

- Stock checkout API: project activation, permissions, configured recipient/asset, exact precision, immutable signed intent, idempotence, project isolation, expiry, replay prevention, execution/ledger token identity and retryable webhooks.
- Shared XPay API: exact transfer proof, concurrent payer protection, disabled-project rejection at authorization, fixed quantity independent of client dollar input, owner-scoped recovery after browser storage loss, verified settlement and duplicate-payment rejection.
- Checkout conversion adapter: wallet ownership, accepted output asset, checkout-specific signed quote scope, separate permission and disable-before-approval handling. Provider responses were fixtures; no live conversion occurred.
- Browser checks: 390px and 1280px, light/dark, fixed amount, optional conversion, separate review and approval, one send, pending never shown as successful, verified merchant return, no horizontal overflow. Screenshots inspected locally. Identity, provider and transfer execution were fixtures.
- Existing USDC hosted checkout, Polymarket funding, scanner, developer product migration and exact transfer tests passed.
- Agreement backend tests and updated Work/Trade UI tests passed. UI fixture now signs a local fixture transaction and tests deterministic pending recovery; no broadcast to a live network. The JSON binding fixture comparison omits undefined fields as persisted JSON does, preserving checks of accepted terms, hashes and identifiers.
- Final Vite build exited 0; artifacts are in `.codex-temp/stock-checkout-dist`. Tracked dist files were not replaced by this build.
- TypeScript check remains failing on repository-wide baseline diagnostics, including missing dependency declarations and target-library mismatches. No diagnostics were reported for the newly added stock checkout, swap adapter, asset descriptor or configuration modules. This is not a clean repository-wide typecheck.

## Before activation

1. Review the staged source scope separately from existing dist/Android changes and reconcile the intended deployment branch.
2. Pixel debug APK installed without clearing app data; existing session, Stablecoins home, XStocks holdings and Swap screen verified against the production backend. A live stock checkout remains untested while activation is disabled.
3. Run a bounded live payment/recovery/webhook test with an explicitly identified payer wallet, merchant/project and spending limit. Those details are still pending from the user.
4. Activate only the reviewed project with both HASHPAYLINK_XSTOCKS_CHECKOUT_ENABLED=true and HASHPAYLINK_XSTOCKS_CHECKOUT_PROJECTS including its project id. Keep the signing secret stable.
5. Verify deployed source revision, project status response, signed webhook delivery and Pocket/browser recovery before broader activation.

The stock checkout capacity is currently bounded to 20,000 stored records globally and 500,000 USD indicative notional per project per rolling day. Archive/retention work is needed before unbounded adoption; historical records are not deleted automatically.

## Release candidate evidence

- Isolated checkout: `hashpaylink-checkout-release-20261006`, based on latest production branch; no overlapping source changes with the two newer Arc Trade commits.
- Native Vite build and Gradle assembleDebug passed. APK SHA256: EB8336A6620641A528CB2D3144D78E37ECEC87732E50D5E44DD03C40C19AEBAA.
- Browser and shared API regression tests passed again in the isolated release checkout.
- Production stock checkout enable flag was checked through the service environment and is disabled.
- A short Pixel startup/navigation sample reported 12 janky frames out of 275 (4.36%); this is not evidence of zero stutter.

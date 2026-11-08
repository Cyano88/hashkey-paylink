# Checkout funding actions - 2026-11-08

## Implemented

Web release source: `C:\Users\USER\hashpaylink-recovery-release-20261104`, commit `3f04dfc67`.
Native source: `C:\Users\USER\pocket-play-update-20261101` (separate, non-Git native lineage).

- Web BrowserCheckoutCard now uses an inline copy icon with an 1800ms Address copied toast. No web bridge action was added.
- Native hosted Add funds shows the fixed receiving asset/network QR and inline copy icon, with Bridge funds as the main action.
- Cash funding reuses PocketCashFundingSheet; stablecoin funding embeds PocketSwapPage in bridge mode with the requested destination and asset. Payment stays mounted. Funding cannot invoke its payment callback.
- Native BNB checkout card and hosted X Layer funding use the same bridge entry point.
- Nested funding sheets use a contextual layer offset so selectors, reviews, and progress render above the checkout. Normal sheets retain their existing layers.
- Cross-bridge-disabled environments fail closed for the new stablecoin entry point and retain direct deposit; they do not silently use a different asset.

## Verification

- Web and native production Vite builds passed; Gradle assembleDebug passed; native source guard passed; new APK installed with adb install -r (data retained).
- Pixel: fresh Lunchroom checkout, Add funds QR, inline copy icon, Address copied toast, and Bridge funds opening the existing cash funding sheet observed. No transfer confirmed or sent.
- Isolated browser fixture: USDT/Polygon passed unchanged to the native bridge entry point; return refreshed once; returning to payment refreshed again without cancellation. The fixture stubs the transaction panel and is not a live bridge execution test.
- Web BrowserCheckoutCard fixture: no Bridge funds button, copy action available, return to payment did not call pay.
- Full native tsc reports existing unrelated errors (ES library hasOwn/at, retired modules, and BrowserCheckoutCard resetEmail/PocketEmailLogin mismatch). No errors in new funding components, PocketSwapPage, or PocketBottomSheet. Do not claim full typecheck passed.
- Pixel switched to another app during later testing. Stablecoin bridge execution and final live Pixel return were not tested.

## Newly requested settlement change - pending destination clarification

User asked to remove Base-USDC-only restriction. No settlement changes have been made yet.

Read-only live policy for FOOD_DEMO_PROJECT_KEY on 2026-11-08 showed:
- settlement: ngn
- payerOptions: Base USDC, Base USDT
- BNB checkout disabled; X Layer checkout disabled

This differs from the user's expectation that all networks are enabled. The saved project configuration and the hardcoded NGN option restriction are separate issues.

`api/checkout-selection.ts` marks every NGN route except Base USDC unavailable. `developerPolicy` uses only the Base refund address for local settlement; merchant native payout routing cannot be unlocked merely by deleting that flag. Hosted USDT settlement validation also rejects local settlement today.

An asynchronous question is pending: should Stablecoins pay the merchant's configured stablecoin wallet while only Cash balance pays the bank, or must all methods pay the bank? This determines destination routing and must not be guessed. Do not repurpose refund addresses as merchant stablecoin receiving addresses.

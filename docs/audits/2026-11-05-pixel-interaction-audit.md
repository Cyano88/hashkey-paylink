# Pixel swap and bridge interaction audit

Native workspace: C:/Users/USER/pocket-play-update-20261101. Backend remains 298a0b995ede834692699a759536363f8d89dad6; no server change required.

## Findings and fixes

The From amount was enabled; its empty 0.00 placeholder used muted styling while the destination zero used active text. Shared PocketExchangeLayout now gives the empty amount active contrast in light and dark modes. Typed amounts and disabled interaction rules are unchanged.

A real device Max-expiry regression was found: Base USDC to X Layer USDT used a maximum amount, but Continue after expiry refreshed it as a fixed amount. Changed fees could cause insufficient balance. PocketCrossBridgePanel now retains Max intent for quote refresh, recomputes the affordable amount, and clears intent on manual edit, route change and cancellation. Stale response guards remain in place.

## Verification

On Pixel 5A160DLCH006VM: entered amount, opened X Layer to Base review, observed expiry replacing Confirm bridge with Continue, refreshed safely, closed review, reversed route, used 25 percent and Max. Tested Base swap reverse/50 percent and live review, switched to Arc, checked both balances and total, and obtained EURC/USDC quote. No signing or fund movement.

After installing the corrected APK, empty From contrast matched To. Repeated expired Base to X Layer Max: refreshed amount changed from 1.097663 to 1.096644 USDC, review opened with 1.10 source, 0.01 fee, 1.11 total and 1.07 USDT receive (display-rounded). No insufficient-balance error. Closed review without confirming.

Five existing browser suites passed: layout, review, presets, cancellation matrix, selector simplicity. Panel suite additionally covers expired Max recalculation, manual intent reset, and six route/provider lifecycle cases. Scoped TypeScript and Android build passed. These checks do not constitute funded settlement testing or a claim that every possible route and device state is bug-free.

Installed APK: native-release/pocket-pixel-audit-20261105.apk.
SHA256: 925CCE80AFA911FC83A769B02D1159C83E0FCFE87E58D222D9614D0A12767D39.
All 1867 APK assets matched dist. Native manifest: native-release/pixel-audit-20261105.json. Source snapshots, screenshots and regression results: output/bridge-swap-audit-20261105 in the native workspace. Native sources are separate from this backend git checkout; do not overwrite them from the older web frontend.

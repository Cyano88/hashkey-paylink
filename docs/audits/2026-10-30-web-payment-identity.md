# Web payment identity and notification routing - 2026-10-30

Agreed design: Activity uses project image, merchant first-letter fallback, then link fallback when unnamed. Beside the Web payment label, show the actual payment-method icon; keep Sent/Received beneath. Pocket receipts retain Pocket branding and use the same method icon beside Web payment. Type spells out Wallet payment, Bank transfer, or Card payment. Current checkout remains wallet-funded; this does not enable bank/card checkout.

Server changes:
- Route transaction push notices to main /activity?receipt=<hash>; native accepts old /xstocks/activity hash links and Activity also matches receiptId.
- Resolve historical branding from the signed checkout record, with one store read for the requested checkout IDs. Preserve account scoping in XPay history.
- Carry merchant name/image and method through notice conversion and the main Activity API sanitizer. Initial live inspection caught the sanitizer omitting the new fields; added an actual Activity-handler regression for payer/receiver and recent/full history.
- Root-relative saved logo paths resolve against the public app origin for native use.

Verification:
- Hosted checkout tests pass, including signed branding retrieval and rejection of tampered merchant names.
- Actual Activity API branding regression, web payment receipt binding, notification routing, stock trade push, exchange transfer suppression, bank receipt presentation tests pass.
- Chrome tests pass in web and native worktrees: valid image, failed-image/initial/link fallbacks, wallet/card/bank method labels and matching image/PDF paths.
- Notification receipt browser lifecycle passes, including receiptId lookup variant.
- Web production build, native Vite build, Capacitor sync, Gradle assembleDebug pass. Pixel installed preserving data. APK SHA256 ce196baccc7cea52b9d72c57e383ab325b832a99e433a0829b6acc28ccb73a30.
- Pixel visually shows merchant initial and wallet-icon Web payment in Activity and wallet-icon receipt heading, preserving amount/direction/reference. Live logo and direct saved-receipt link verification pending the final API rollout.
- No fresh push sent or payment approved. Existing native inbox did not contain the Web payment notice; do not claim a fresh OS push tap was tested.

Final source revision: 7f3330c9ab2bde54b14a0e42a64d69a441906e85. Render deploy dep-dbi4lkss728c73cb62kg (status to be appended).

Deployment completion: Render deploy dep-dbi4lkss728c73cb62kg is live at 7f3330c9ab2bde54b14a0e42a64d69a441906e85 (2026-10-30 07:53:22 UTC). Public receipt lookup for both observed Lunchroom payments returns the saved https://app.hashpaylink.com/brand/lunchroom.png image URL. A direct Pixel receipt URL attempt timed out at Connecting securely; subsequent phone API probe timed out on LTE. Workstation public API returned 502 during rollout, then 200 after rollout. Phone connection verification remains pending; do not claim live logo rendering or a fresh OS push tap passed. The installed Activity layout and method icons were visually verified before the connection stall.

## Connected Pixel follow-up

- Found a second, native-only cause of the initial fallback: Capacitor intercepts app.hashpaylink.com as bundled assets. On the actual Pixel the app-host logo failed, while the Pocket-host image loaded at 513 x 162.
- Added a native presentation resolver for first-party hosted merchant images. External merchant HTTPS URLs and web rendering remain unchanged. No merchant artwork was replaced or recoloured.
- Added builder guidance in Branding and Getting started: recommend square 512 x 512 PNG/WebP with padding; JPG remains accepted; public HTTPS on the project website origin; initials fallback on failed images.
- Routing and fallback browser regressions pass in both worktrees. Web/native production builds, Capacitor sync and Gradle assembleDebug pass.
- Installed APK preserving app data: SHA256 20485417726a811bf10c219ef69a1806771b9eb92fd1f2e53038428764ba4b87.
- Real Pixel CDP verification: Lunchroom image naturalWidth=513, naturalHeight=162, source https://pocket.hashpaylink.com/brand/lunchroom.png. Activity tap and direct saved-receipt URL both open fb6986a1-b175-476b-b219-1b5b17f4887b. Visually verified 1.50 USDT, Received, Wallet payment, Lunchroom, X Layer, matching reference, Pocket branding and wallet icon beside Web payment.
- ADB screenshots in native output/playwright/lunchroom-logo-fixed.png and lunchroom-receipt-fixed.png. CDP screenshot capture timed out; ADB capture succeeded. No fresh OS push delivery/tap tested and no new payment made.
- Source 64b30d493cfa9ef995c536fc6a0401750a7e9035; Render deploy dep-dbi5b5ss728c73ccv950 pending completion.
`nDeployment completed: dep-dbi5b5ss728c73ccv950 live at 64b30d493cfa9ef995c536fc6a0401750a7e9035 on 2026-10-30 08:36:17 UTC. Pixel logo and saved-receipt checks above supersede earlier connection-pending notes. Fresh OS push tap remains untested.

## Incoming amount colour and merchant canvas

- Completed incoming Activity amounts use emerald-700 in light mode and emerald-400 in dark mode. Outgoing, pending, failed, reversed/refunded, missing-status and wallet bridge/swap rows remain neutral. Existing signs/direction labels stay intact.
- Loaded merchant images sit inside padded white circular canvases; failed images retain the original initial/link fallback styling. Original merchant artwork is unchanged.
- Wallet payment uses the Heroicons 24 solid WalletIcon; image/PDF export fills the same official path. Card and bank remain their existing outline icons.
- Both worktrees pass expanded Activity status/direction and merchant fallback browser checks, plus method label/export checks. Production CSS fixture verified light/dark amount colours and white image canvas inside the actual Pocket colour scope.
- Native and web builds passed; Android Capacitor sync/Gradle assembly passed. Installed APK SHA256 c1c3472f96ce48ca48b8edcfe75643e014d5ce45cdd5d0902359a7bc578f3cb3.
- Real Pixel dark-mode check: Lunchroom image loaded (513px), canvas rgb(255,255,255), padding 4px, +1.50 USDT rgb(52,211,153), wallet SVG fill=currentColor. Visually verified output/playwright/avatar-green-dark.png in native workspace. Existing outgoing and bridge values neutral.
- Device light-mode navigation paused because user opened screenshot annotation; did not interrupt it. Light mode verified in browser, not claimed as device-tested. Previous real saved-receipt opening checks remain recorded above; updated exports passed browser tests. No new payment or notification sent.
- Source 54772aa366de13995fc3cf9a313c26dc50a473d6. Render dep-dbi5i3nlk1mc73fbfqeg rolling out.
Deployment complete: dep-dbi5i3nlk1mc73fbfqeg live at 54772aa366de13995fc3cf9a313c26dc50a473d6, 2026-10-30 08:50:11 UTC.

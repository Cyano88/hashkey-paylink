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

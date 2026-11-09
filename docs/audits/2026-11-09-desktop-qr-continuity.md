# Desktop Pocket QR continuity - 9 November 2026

The desktop lost its local Pay with Pocket choice when polling navigated from a parent selection checkout to the phone-selected child. A successful payment still completed, but the intermediate page reset to payment options.

The parent now records Pocket presentation in its URL and stays on its original QR while the server reports a pending selected payment. Polling still reads server-verified parent/child state. Cash/stablecoin changes on the phone update the displayed method and QR hint. Processing/terminal state follows the existing child/result flow. Explicit Pay on web and Back leave the waiting flow; reload restores it. Polling failure displays an error rather than leaving a misleading waiting screen.

Changes are limited to web CheckoutChoice and HostedCheckoutEntry. No native rebuild or payment backend change is needed.

Verification:
- Actual component browser fixture passed Circle, BNB and X Layer parent handoff, route selection, reload, cash/stablecoin changes, Back, explicit browser continuation, expiry, polling errors, paid navigation and stopped reads. No payment writes.
- Existing parent-handoff, cash app/Android/download/browser handoff and signed-child status projection suites passed.
- Initial new fixture failed because it expected detail copy hidden by the successful result component; corrected it to assert the actual Successful heading. This was a test expectation correction.
- Pixel foreground inspected read-only: Home has cash/total balances and the expected Nov 9 Lunchroom received/sent entries. This does not establish a fresh-payment cache-before-success transition or a full restart animation test.
- Build/typecheck and deployment results are appended below when complete.

Final local checks: source build passed (2m25s), changed-file TypeScript diagnostics passed for both components, and git diff whitespace checks passed. The full-project tsc run was stopped after over nine minutes without a result; no clean full-project typecheck is claimed. This release relies on the complete source build, focused diagnostics and checkout regression suites. No native source changed.

## Live release
Render dep-dbophm5g1s2s73fupgs0 is LIVE at d1337f2440824923a52655f78dbac6dd1b18822a, updatedAt 2026-11-09T10:02:12.190383Z. The hosted source build passed. Both API domains briefly returned 502 during instance replacement, then app.hashpaylink.com and pocket.hashpaylink.com /api/health returned JSON HTTP 200. /launchroom returned HTML HTTP 200.
The live Chrome extension connection did not reestablish after reboot; its waiting attach was stopped. QR behavior is verified with the actual component browser fixture, not a fresh live phone-to-desktop payment. Pixel Home was inspected separately through its foreground WebView. No funds moved and no native APK was rebuilt or installed in this change.

## Live handoff verification, order 9cedff
A separate headed Playwright Chrome window connected after the earlier extension/runtime failures. Pixel remained on the existing authenticated wallet session.
- Parent chks_d2e4d9743c0f4cd7b5e4872b, amount NGN 2053.13, order suffix 9cedff.
- Stablecoin child chk_455829ecd9ea438b8200 / attempt pat_0539723c4c7a57755b864a3d selected on Pixel. Desktop remained on parent mode=pocket with QR/waiting visible.
- Pixel Change payment method selected cash child chk_65a41b6f1c81481a8533 / pat_7a3819f406a7a6b607bdcff5. Desktop changed its heading and QR href to cash_balance without losing QR or parent/order.
- Switching back to Base USDC reused the original stablecoin child. Desktop restored stablecoin heading/href while retaining QR.
- A deliberate desktop reload BEFORE payment restored QR/waiting. No further reload is to be used as proof of automatic success.
- Pixel review: Confirm payment, 1.500004 USDC, Base, Lunchroom, NGN 2053.13. User asked to confirm and enter PIN on device. No payment approval/completion observed yet.
- Read-only mutation observer armed before approval: zero cached rows for this fresh child. It will capture matching canonical Activity rows at first visible Successful heading to verify cache-before-success. It does not change storage, payment behavior or requests.

The user stopped this test after identifying the raw-decimal display. Approval was not submitted, the observer was disconnected, and the checkout expired unpaid. Pixel returned to Home. The presentation correction and subsequent checks are tracked in 2026-11-09-checkout-presentation-quality.md.

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

# Pocket paid checkout recovery

The Pixel showed Merchant payment / Processing for the 0.05 USDC bank-test top-up, checkout `chk_0b4ede674e0d4876bd91`, attempt `pat_a9af1ea3afb8f8e619774496`.

The production checkout API reported both checkout and attempt paid, with transaction `0xbfd0784e7c4b338f2c92dc5f37a804d57b9c32580b3a0b4d95b2405a4e14d441`. Read-only WebView inspection found the same transaction but hosted confirmation state `error`, with `Could not reach the service. Try again.` The marketplace collection was independently pending finality; that is not the payer checkout outcome.

Changes in both the web release and original native source:

- Recover a lost confirmation response by polling the existing checkout. Require matching checkout and attempt IDs, both paid statuses, and the server receipt identifier. No transaction submission occurs in recovery.
- Cancel polling on unmount or identity change, retry temporary failures, and preserve verified state against a late failed confirmation request.
- Reopening an exactly verified paid attempt reaches the existing paid receipt screen. Failed, expired, incomplete and mismatched attempts remain closed.

Validation: recovery hook regressions pass for lost responses, unsettled checkout, wrong checkout/attempt, missing receipt, retry, cancellation and single completion. Existing late-verification and eight-network checkout activity regressions pass. Original native source guard passed. Initial recovery APK build, Gradle and data-preserving Pixel installation passed. Final reopened-checkout native Vite assets built (3m44s); the PowerShell redirected wrapper returned 1 despite Vite completion, so this is recorded separately from the successful asset sync and Gradle exit 0. Final Capacitor sync, Gradle (36s) and data-preserving Pixel installation passed. At 13:57 Lagos, the actual Pixel displayed Successful, 0.05 USDC, and the exact original transaction reference in its receipt. Screenshot: output/playwright/pixel-sheet-recovery.png. Changed native and web TypeScript diagnostics passed; the pre-existing native BrowserCheckoutCard resetEmail prop mismatch remains outside this change.

Web commits: `1dba7d8a3` (poll recovery), `76efe5b44` (reopened paid attempt). Render deployment `dep-dbq64umk1f9s73dni0l0` requested for the first commit. Subsequent Render API status requests timed out; do not infer deployed status from the request. Public service briefly returned HTTP 502 around 12:44-12:48 UTC and health returned healthy afterward. Final release status remains to be reconciled.

No duplicate checkout payment or bank payout was submitted during this fix. Bank acceptance still requires collection finality, fee coverage, verified gas coverage and bounded payout execution; developer webhook configuration is still absent. Keep the 0.3% withdrawal commission and all payout/refund worker gates unchanged.

Follow-up observed on the recovered receipt: its displayed time was the reopen time (13:57), not the server confirmation time (13:26:49). The fallback receipt uses Date.now; the public attempt receiptId is shortened while receiptUrl contains the full signed reference. Correct the receipt-reference hydration before calling receipt acceptance complete.


## Follow-up verification

The shortened-reference issue above is fixed: recovery uses the full signed reference from the server receipt URL, while retaining the shortened attempt ID only as a legacy fallback. The installed Pixel receipt now hydrates the original confirmation date and business name, with verified payer fees and exact total paid. The actual receipt showed 11 November 13:26, 0.05 USDC order + 0.000125 processing + 0.004393 collection network fee = 0.054518 USDC. The success sheet also uses the verified total when fee evidence is available.

Render status was recovered: `dep-dbq64umk1f9s73dni0l0` is live for `1dba7d8a396ac764a9a7adb6e629b59a4ab49baf`, updated 12:47:14 UTC. The broader receipt/summary release still requires its own deployment verification. See `2026-11-11-receipt-audience-policy.md` for audience boundaries and reporting policy.

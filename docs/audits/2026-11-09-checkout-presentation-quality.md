# Checkout presentation and navigation - 9 November 2026

The live Pixel review exposed 1.500004 USDC instead of the accepted 1.50 USDC. The order was left unpaid, the approval observer disconnected, and the expired checkout returned to Home. No PIN, signature or transfer was submitted.

Changes are applied separately in the web recovery release and the original native source folder. Stablecoin amounts use two decimals, tiny nonzero amounts use <0.01, and fiat uses currency minor units. Read-only fields, review/result amounts, balance, fees, totals and funding hints use display formatting. Raw amounts remain unchanged for quotes, authorization and execution. Browser labels preserve already formatted grouping and tiny-value notation.

Review preparation now enters the review before paint, keeps payment-method metadata mounted across review Back, and shows a disabled spinner during preparation/confirmation. This avoids an enabled Continue flash and a disappearing payment-method control on Back.

Verification so far:
- Native and web actual checkout presentation fixtures passed at 320/390/412 widths, including USDC, USDT, NGN and tiny amounts. Exact execution input remains 1.500004 or 0.000004. Frame sampling checks the loading-to-review transition; Back and native Back preserve the method control without refetch. Double-tap invokes confirmation once; simulated approval cancellation and Close return Home without writes.
- Native method choice and funding suites passed, including Back, Close, stale account responses, retries and slow refresh.
- Expiry/approval suite passed: expiry dismisses approval, late PIN/biometric verification cannot authorize, navigation abort dismisses, fresh request succeeds.
- Security loading suite passed: hosted checkout does not flash the native PIN sheet, native loading and explicit approval/cancellation remain intact.
- Focused TypeScript diagnostics passed for changed presentation files in both roots, excluding the previously documented native resetEmail prop mismatch. This is not a clean full-project typecheck claim.

Final build, device verification and release evidence will be appended after completion.

Final source builds passed in both roots (2m24s each). Native source-lineage guard and Capacitor sync passed. The browser card regression passed at 320/390/1280 in light and dark themes, including already formatted grouped/tiny values, duplicate taps, funding return, cancellation and expiry. Focused diagnostics including BscCheckoutPage passed with the same existing native resetEmail exception.

## Native package and web rollout

Native Gradle assembleDebug passed (1m19s), and adb install -r succeeded on Pixel 10 Pro 5A160DLCH006VM with app data retained. APK SHA256: 1764bd5b981d160ad1130a5fe79d4fb942ed74641fd35cff7e2e2fd6d7064be2. Final reviewed native sources and SHA256 manifest are saved under native-release/checkout-presentation-source-20261109.zip and checkout-presentation-source-sha256.json in the original native folder. Native/web sources remain separate.

Web commit e95b77b29eebb8b0dd60d2227c655572f9407548 was pushed and Render deploy dep-dboq7frbc2fs73ct6jrg started. Live status/health still pending at this entry.

Fresh unpaid UI-check order 0c7082 uses parent chks_fe8804d0de7547e286052bff. Device verification paused after installation because Instagram was foreground; user asked to bring Pocket forward. No checkout approval was requested or submitted in this correction.

## Live verification

Render dep-dboq7frbc2fs73ct6jrg is live at e95b77b29, updated 2026-11-09T10:48:47.394633Z. Both app and pocket /api/health returned HTTP 200 with healthy database state.

Pixel review for parent chks_409f3f0343e6415ea7a18eea / stable child chk_4f72e15049684e72879a showed heading 1.50 USDC, Total 1.50 USDC, order price NGN 2,053.13 and Base. Captured and visually inspected output/playwright/pixel-checkout-precision-review.png. Review Back returned to amount input with method control present; method chooser Back returned cleanly; switching to Cash retained order amount. No confirmation/PIN/signature was submitted. Earlier near-expiry order entered review then removed payment controls on expiry and returned Home correctly. Frame sampling captured loading/review/expiry transitions without horizontal overflow.

A separate live UX issue was caught: Lunchroom showed Payments are currently unavailable while its initial price request was pending. Added explicit Loading prices status and disabled checkout during load. Delayed-response browser regression passes along with expired/pending/paid/processing/unavailable-order recovery. Follow-up web source build passed (2m32s). Native source does not need another rebuild for this merchant website change.

Cash switching selected child chk_80a9293900a144e7bd18 and Close returned to Home. The real-device frame log revealed a brief old-form exposure when the method chooser closed before navigation. Follow-up correction retains the chooser in its disabled loading state until the destination replaces it; selecting the same checkout closes normally instead of leaving a stuck spinner. Regression covers both changed and identical destination URLs. Lunchroom loading release c998846cd / dep-dboqhm3rjlhs73c0llf0 is live, updated 2026-11-09T11:10:32.896915Z.

## Final method-transition package

Both native and web regressions passed changed-route and same-route reselection. Final source builds passed (native 2m09s, web 2m03s), Capacitor sync passed, Gradle passed in 21s, and adb install -r succeeded. Final installed APK SHA256 a13b83f17073e2d45d1d82959e6fda5ca6ccd52f3820a57c0c5b2e6a177b6f0c supersedes the earlier package hash. The native source ZIP/manifest were refreshed to include both method-transition components. Phone was in WhatsApp at final install; it was not brought forward. Thus actual-device decimal, review Back, chooser Back, cash switch, expiry and Close are observed, while the final transition adjustment is verified by component regressions and build/install rather than a second live device sequence.

Web method-transition commit d8a367dbd44f65a0147922aa88e0a7c9de5e6538 is deploying as dep-dboqln3m8hqs73eok0bg. No funds moved in this QA session.

Final Render release dep-dboqln3m8hqs73eok0bg is LIVE at d8a367dbd, updated 2026-11-09T11:18:48.204212Z. Transient 502 responses during replacement cleared; both app.hashpaylink.com and pocket.hashpaylink.com /api/health returned JSON HTTP 200, ok=true, healthy=true, database=true, unresolved=0 and stale=0.

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

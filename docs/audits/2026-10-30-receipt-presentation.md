# Receipt presentation verification - 2026-10-30

Scope: bank payout receipt narration and wallet-funded web receipt currency. Source commit: 85863ce698c5b4dc7c1df45138a29b30a93929af.

- Bank payout remains Bank transfer. Receiver account is explicitly identified even when settlementType is absent.
- Removed the combined Amount & narration row. Show a separate Narration only when a real note exists; suppress automatic bank labels.
- Native receipt contained a double-encoded middle dot. Removed it from the combined row and corrected the destination separator.
- Current hosted checkout is wallet-funded. Preserve its actual token amount even when merchant fiat settlement metadata is present. A future bank-funded checkout must carry verified payer payment-method and fiat paid-amount fields; do not infer bank payment from merchant settlement. This patch does not enable bank checkout.
- Narrow native edits preserve existing cash, funding-status, delivery, and export behavior.

Checks passed: bank-receipt-presentation-smoke (web and native), bank-receipt-export-browser-smoke (actual image/PDF generation in Chrome, web and native), web-payment-receipts-smoke, pocket-receipt-policy-smoke, pocket-bank-receipt-refresh-smoke, native pocket-receipt-export-browser-smoke, production web build.

Existing web pocket-receipt-export-browser-smoke fails its status-heading assertion (expected two Successful text draws, observed zero); the web export renderer does not use that native-style heading. Bank-specific export checks pass. Do not report the older general test as passed.

Deployment and native installation verification to be appended after completion. No new payment approved or broadcast during this change.

Completion:
- Render deploy dep-dbi3nhc9v7es738k32ng is live at revision 85863ce698c5b4dc7c1df45138a29b30a93929af (2026-10-30 06:45:14 UTC).
- Playwright reloaded the existing Lunchroom receipt after transient rollout 502 responses cleared. Verified Web payment, 1.50 USDT, Successful, Type Wallet payment, X Layer and the unchanged reference e6c65f5d-9e09-400f-b35d-4f6b99f499ef. Live JS asset returned HTTP 200.
- Native Vite, Capacitor sync and Gradle assembleDebug passed; adb install -r succeeded on Pixel 5A160DLCH006VM. App data preserved. APK SHA256 39937f16e6cbdce9138991303b8e4b59b5d458ef295907809c5f080cdaf65865.
- Phone was in another app; installed in background and did not claim a post-install receipt-screen inspection. Native browser export tests passed with the updated source.

Pixel onscreen follow-up (2026-10-30): reopened Pocket and inspected the existing successful bank receipt. Verified NGN 1,000.00, Type Bank transfer, Base funding network, OPay masked account ending 9696, Paid with 0.75 USDC, Delivered, and unchanged reference. No combined Amount & narration row or broken separator. Both Share as PDF and Share as image opened Android's share sheet; image preview visibly matched the corrected receipt. Dismissed both sheets without selecting a recipient or sending anything. Left the receipt open. Evidence: output/playwright/receipt-current.png, receipt-export.png, receipt-image.png (local only).

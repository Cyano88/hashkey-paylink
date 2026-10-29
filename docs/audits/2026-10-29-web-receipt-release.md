# Web receipt release verification

## Scope

Only the checkout receipt presentation was released. Purchaser email and subscription preview changes remain local and disabled. The installed Pixel APK was not changed by this release.

- `84211b03bd9812614d73e3ca9c7664856ac490a6`: merchant-first downloaded receipt, no fabricated partner initials, Type Wallet payment, timezone-qualified timestamp, full reference.
- `c07759334398d63da2979c001d3d643a54bd3939`: restore timestamp on the dedicated web details screen. Removing the shared Date row correctly removed duplicate dates from downloads, but the dedicated web screen needed its own timestamp. This was caught during production verification.

## Evidence

- First deployment `dep-dbhkln942hec73cng53g` live at 2026-10-29T13:37:49Z on exact commit 84211b03b.
- Fresh Chrome downloads from production passed: PDF and JPEG, Lunchroom header, 1.50 USDT, Wallet payment, complete reference `e6c65f5d-9e09-400f-b35d-4f6b99f499ef`, no HA fallback and no page errors. Both exports inspected visually; PDF has one page.
- Existing parent and child checkout status endpoints returned HTTP 200 paid with unchanged amount, receipt ID and transaction hash after the first deployment. No payment was sent or retried.
- Responsive receipt checks passed at 320/390/1280 in light/dark. Receipt policy and capability-security smoke tests passed.
- Artifacts: `output/playwright/live-released-receipt.pdf`, `.jpg`, `live-released-receipt-screen.png`, `live-released-receipt-pdf.png`.

## Outstanding

Final timestamp deployment `dep-dbhkpru7bikc73essrl0` became live at 2026-10-29T13:46:20Z on exact commit c07759334. Fresh production Chrome checks passed again, including the visible payment timestamp and both real downloads; no page errors. Parent and child status endpoints again returned 200 paid with unchanged payment identifiers.

Repository typecheck errors, dependency advisories, real purchaser inbox delivery, subscription production readiness and paid-order webhook delivery remain separate open work. See the billing verification audit for details.

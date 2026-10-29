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

## Saved merchant logo correction

User identified that the real Lunchroom logo should be present. Verified the existing paid checkout already contains `https://app.hashpaylink.com/brand/lunchroom.png`. Two mapping defects omitted it: the recovered receipt replaced merchant branding with Hash PayLink, and the export branding helper forced an empty image URL. Commit `67fd6baa659565a3e72969ac0d4f5d2c00854eee` preserves the signed checkout's merchant name/logo and renders wide wordmarks without a duplicate header name. Missing/failed logos fall back to merchant text, never fabricated initials.

Four-asset checkout smoke tests now assert branding survives receipt recovery. Browser export tests cover real Lunchroom wordmark, missing and failed logos, amount and reference preservation. All pass. PDF and JPEG fixtures visually inspected. Deployment `dep-dbhl1ton74is73eb1ulg` live at 2026-10-29T14:03:31Z on exact commit 67fd6baa6. Fresh production PDF/JPEG downloads passed; instrumentation confirmed the actual saved Lunchroom logo was drawn in both exports. Production JPEG visually checked with 1.50 USDT, 11:37 GMT+1 and the full existing receipt reference; PDF rendered successfully as one page.

## Back navigation and requested email test

- Commit `7620d3e357c1707dd11161ca33c8b127eced7dfc`, deployment `dep-dbhl9pifngtc73bv967g`, live 2026-10-29T14:22:33Z: web checkout receipt uses an accessible top-left Back arrow. Existing non-checkout receipt actions retained. Responsive browser checks pass. Production checks verify top-left placement, absence of Done, return to previous page, and working PDF/JPEG downloads.
- User explicitly requested a test email and supplied the recipient. One immutable, idempotent test email was sent using the configured sender, the verified existing Lunchroom receipt and the actual downloaded production PDF. Subject `[Test] Receipt from Lunchroom`. Provider accepted it; status lookup returned 401. Actual inbox receipt and PDF attachment preview were subsequently verified visually in Gmail on the Pixel. No automatic sending or subscription billing was enabled. This was a one-off transport/template/attachment test, not verification of the disabled production queue.
- Pixel Gmail review: amount and CTA readable in dark mode; merchant logo and PDF preview correct. Recommended refinements: compact order reference with full receipt ID secondary, reduced spacing, intentional treatment of the logo's existing cream background, consistent email/PDF timezone, and configured merchant support link. These refinements have not been shipped. Screenshots `output/playwright/pixel-email-gmail-header.png` and `pixel-email-gmail-footer.png`.

## Developer receipt settings and automatic email release

- Commit `d74bc23061143ed1bb8b1d359218683b4b36485a` adds Settings → Receipts & support, a monitored merchant support address, timezone, and explicit project opt-in. The compact email refinements above are now shipped. Automatic email PDFs are searchable, one-page documents with the saved merchant logo. Web-export PDFs remain raster documents.
- Deployment `dep-dbhm01ec6qcc73fp7fh0` became live at 15:07:49Z. After saving CHECKOUT_RECEIPT_EMAIL_ENABLED=true, deployment `dep-dbhm12ul5iis738k27i0` became live at 15:12:53Z. Resend and the verified fallback sender are configured. Subscription billing remains disabled and its local preview route was not included in the release.
- Actual authenticated Lunchroom console: receipt settings tab rendered, Lagos timezone saved successfully and persisted after reload. Project `dev_d4a21d56390f4a1e8d` remains opted out with support email blank, awaiting the merchant's address. Screenshot: `output/playwright/live-developer-receipts.png` (before timezone change).
- Tests passed for settings ownership/validation, verified recipient capture and privacy, canonical receipt reconciliation, no backfill, failure isolation, retry/lease/idempotency, disabling delivery, email presentation and responsive console save flow. Production frontend build passed. PDF fixture was rendered and visually checked, with one page, searchable amount/reference/date and an embedded actual Lunchroom logo. Expanded typecheck retains unrelated repository diagnostics; new receipt modules have none.
- Transient 502s occurred during the follow-up startup. After deployment became live, health and the existing public receipt returned 200. Parent and child checkout status both returned 200 paid with unchanged amount, transaction hash and receipt ID. No new funds moved.
- Remaining: obtain merchant support email, enable Lunchroom receipts, then complete a new user-approved payment and verify the automatic email job, inbox receipt and attachment. Earlier manual email tests do not count as this funded automatic-delivery test.

## Receipt activation, second payment, and inspected Stripe email reference

- Merchant supplied the support address. Lunchroom receipt emails were enabled through the existing authenticated dashboard; support address, enabled checkbox and Africa/Lagos timezone were verified after reload. The developer-console save operation succeeded.
- New user-approved order `2cc3da2b7b664604a00f583bacfd5f80`: parent `chks_3e5e6331375d4eedae2f498c`, child `chkx_b1237d2c2f2d45be8562891c`, receipt `c30de78e-158d-4799-8ebb-083dfaffa43b`. Both authenticated status endpoints returned 200 paid, 1.50 USDT on X Layer, transaction `0x91e21a935c0c3ed756a3261059c39cfae1a9a0ea995fc92bc3e08df0ea65be47`. Browser order confirmation also verified. Automatic inbox delivery is still unverified in this audit.
- Inspected the actual Stripe-powered Render email on the Pixel, including scrolling from the footer to the payment summary and order rows. Implemented separate summary/order cards, left description/right amount table, Total and Amount paid rows, one quiet Download receipt footer row, external support text, and centered muted Powered by text with heavier Hash PayLink. Canonical checkout description is used; item quantities are not fabricated. One-time receipt emails have no invoice action. Existing web Back navigation is preserved.
- Commit `22c8e59258c746d6764196a058eacfec36f2119e` adds direct PDF downloads. Final table-layout commit `7e31ebe0e3a22dbe9556b8c84833912479d92f96`, deployment `dep-dbhn3dul5iis738l8nf0`, live 2026-10-29T16:25:05Z. Production build passed; health and existing receipt endpoints returned 200 after rollout.
- Tests passed: email presentation, durable queue/retries, PDF canonical lookup and frozen-attachment reuse, and browser layout at 320/390/1280. Actual paid receipt download through the new email link returned application/pdf with attachment filename; Chrome downloaded it. PDF parsed as one page with the correct 1.50 USDT and full reference. Rendered actual-order email screenshot `output/playwright/live-order-email-layout.png`; downloaded file `output/playwright/live-direct-receipt.pdf`.
- Already-delivered emails and frozen attachments retain their previous presentation. This release does not resend them or move funds. Product-level itemization and automatic inbox confirmation remain distinct follow-up checks.

## Final funded acceptance: order #498541

The user confirmed immediate automatic email arrival. Pixel Gmail was then inspected directly: the redesigned payment summary, aligned order table, one Download receipt action, merchant support address, muted weighted branding footer and PDF attachment were visible in dark mode. Screenshots: `pixel-redesign-email.png` and `pixel-redesign-order-table.png` under `output/playwright`.

Read-only durable-store verification matched order `4985416349ba4ec08cfb683ea775dff2`, parent `chks_611854dd2e1c4bb99f7ae01f`, child `chkx_a23f82e030034f19b4782870`, and receipt `fb6986a1-b175-476b-b219-1b5b17f4887b`. All agree on 1.50 USDT paid on X Layer, confirmed 2026-10-29T16:50:05Z, transaction `0xfbf0a90e5dd207155dcdc5b959fa953e6f60cabe0932e427e32ec3e02190e604`.

- Webhook `stock-paid:chkx_a23f82e030034f19b4782870`: `payment.confirmed`, HTTP 200, delivered on the first attempt at 16:50:14.570Z. The merchant receiver independently persisted the matching event and payload hash; the checkout outbox is marked delivered. The merchant order is paid and retains the same receipt ID.
- Automatic receipt email: durable job state sent, one attempt, provider ID `01a18891-be2f-7b1c-9436-f6bc78870d52`. Combined with the user's inbox confirmation and phone inspection, automatic email delivery is verified for this payment.
- Fresh isolated Chrome: paid order reopened and reloaded; receipt opened from the order, reloaded, then reopened directly in a separate tab. Correct amount, full reference, wallet-payment type and transaction were preserved. Web PDF export and direct PDF response both passed. Back returned to the confirmed order. No page errors or app API mutation requests occurred; mutation requests were blocked by the test harness.
- Recovered PDF rendered as one page. Screenshot and PDF artifacts: `recovered-latest-receipt.png`, `recovered-latest-receipt.pdf` under `output/playwright`.
- Existing `food-demo-webhook-smoke.mjs` passed invalid/stale-signature rejection, duplicate idempotency, conflicting-event rejection, pending retry behavior and authoritative-status verification.

This closes the funded Lunchroom X Layer checkout, signed webhook, automatic email, and receipt recovery acceptance checks. It does not certify other payment rails, provider/AML approvals, subscriptions or card payments. No new payment or webhook replay was initiated during this verification.

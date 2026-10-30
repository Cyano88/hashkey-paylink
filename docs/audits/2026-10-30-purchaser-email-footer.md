# Purchaser email footer - 2026-10-30

- Support wording: Questions about your purchase? Contact {merchant}. The contact text links to the configured support email; the HTML does not show the address. Plain text retains the address for usability. Missing/invalid support settings still omit the support paragraph.
- Powered by Hash PayLink remains centred on a separate line with 28px top margin and 4px padding. The approved official hash-logo-modal-light.png mark is 16x16 beside the name. Empty image alt avoids repeating adjacent branding; readable brand text remains when images are blocked.
- No receipt PDF layout or receipt delivery policy changed. No email resent.
- Existing presentation and direct-PDF regressions pass (assertions adjusted for the additional safe footer image and span). Mobile Chrome preview verified contact mailto destination, hidden visible address and separate footer. Exact local logo used for rendering during a transient deployment 502; public logo later returned HTTP 200 image/png, 5667 bytes.
- Preview: output/playwright/purchaser-email-preview.png. Source: 4ec17dd2e9a00c7c0c31a0a71509f8dc88f0681d. Deploy: dep-dbi5rae9j67c73frjnmg.
- Deployment confirmed live at 2026-10-30 09:10:18 UTC.

## Pixel layout correction

- Inspected Pixel Gmail screenshot output/playwright/email-footer-current.png: attribution still appeared on the same shaded content background as Questions, and 16px logo was taller than text.
- Moved attribution outside the shaded receipt/support wrapper. Body, outer main and attribution are transparent; receipt/support shading stays scoped to the inner wrapper. Attribution is before the email client's attached-PDF area, whose rendering is controlled by the client.
- Reduced logo to 13x13 alongside 13px text, baseline offset -2px.
- Presentation and direct-PDF regressions pass. Mobile browser preview visually verified separation and size. No new email sent, so corrected Gmail rendering is not yet verified on a newly delivered message.
- Source 33f17fcb26d5890cc87975821795354812abb79c; deploy dep-dbi6bpp42hec73cj8rtg.
- Correction deployment confirmed live at 2026-10-30 09:45:40 UTC.

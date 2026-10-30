# Purchaser email footer - 2026-10-30

- Support wording: Questions about your purchase? Contact {merchant}. The contact text links to the configured support email; the HTML does not show the address. Plain text retains the address for usability. Missing/invalid support settings still omit the support paragraph.
- Powered by Hash PayLink remains centred on a separate line with 28px top margin and 4px padding. The approved official hash-logo-modal-light.png mark is 16x16 beside the name. Empty image alt avoids repeating adjacent branding; readable brand text remains when images are blocked.
- No receipt PDF layout or receipt delivery policy changed. No email resent.
- Existing presentation and direct-PDF regressions pass (assertions adjusted for the additional safe footer image and span). Mobile Chrome preview verified contact mailto destination, hidden visible address and separate footer. Exact local logo used for rendering during a transient deployment 502; public logo later returned HTTP 200 image/png, 5667 bytes.
- Preview: output/playwright/purchaser-email-preview.png. Source: 4ec17dd2e9a00c7c0c31a0a71509f8dc88f0681d. Deploy: dep-dbi5rae9j67c73frjnmg.
- Deployment confirmed live at 2026-10-30 09:10:18 UTC.

# Docs branding alignment — 2026-10-30

Compared the live developer portal header with DocsLayout and CheckoutChrome. Docs now reuses HashPayLinkCheckoutBrand, including the existing icon asset and wordmark. Header height and touch targets match the developer portal; sidebar selected state uses neutral colours. Kept documentation grouping and reading width. Mobile hides the secondary Docs label to preserve room at 320px.

Playwright passed all 22 pages and existing navigation checks. Added a real image decode check at 320/390/1280 in light and dark modes, and reviewed 320px light and 1280px dark screenshots. Preview server now serves the actual logo asset.
- Production build passed (exit 0), with existing dependency annotation and bundle-size warnings.

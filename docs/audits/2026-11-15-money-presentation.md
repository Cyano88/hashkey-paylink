# Currency-first presentation

The approved display convention uses currency or asset codes before amounts, with an inherited font, smaller medium-weight code and tabular numbers. USD valuation remains distinct from USDC/USDT. Exact receipt decimals are preserved without converting strings through Number. Shared presentation now covers Pocket balances/activity/confirmation/receipts, checkouts, developer payment and marketplace views, email/PDF receipts and business summaries. Numeric input and fee calculation contracts remain unchanged.

Validation: web focused TypeScript; web and native production source builds; Android debug assembly and original-source guard; money identity/precision tests; real checkout expression interaction tests (including sub-cent amounts, exact execution values, Back and double-submit protection); 320/390/1280 light/dark typography, balance privacy and input checks against both roots; payer/withdrawal receipt policy, frozen PDF, notification, audience binding, summary period and delivery tests. Four PDFs were rendered; withdrawal and weekly-summary layouts were visually reviewed. No live payments or emails were generated.

Native full selected-file diagnostics still report the previously recorded BrowserCheckoutCard resetEmail prop mismatch and legacy ArcTradeAgreementPage Object.hasOwn library target mismatch. These unrelated issues were not hidden or changed; source builds and the real native checkout fixture pass. This is not a clean whole-tree native typecheck.

Native source-policy additions are recorded in native-release/money-style-review-20261115.json. Original baseline and feature configuration remain intact. Historical immutable receipt attachments are retained.

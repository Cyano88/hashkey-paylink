# Pocket funding detour

Confirmed shortages replace the payment action with muted `Insufficient funds` and `Add funds`. Explicit OKB shortages use `Insufficient fee balance`. Unknown or stale display balances do not establish a shortage; pending transactions retain their existing recovery flow.

The funding screen keeps the transaction form mounted. Stablecoin deposits first open the existing network sheet, then show the selected wallet QR, address, Copy action and network instruction. X Layer deposits show the required asset and X Layer wallet. Return to payment refreshes without signing or submitting. Cancel clears the active form; it does not erase submitted transactions or saved gift recovery records. Ordinary deposits have no payment-return controls.

Integrated surfaces: stablecoin sends and requests, X Layer sends and stock trading, XPay checkout, bank payouts, bills, gift creation/funding, bridge and Arc swap. Existing viable cross-network payment funding remains available. This change does not alter gift claim execution or contract rules.

Validation:

- Exact decimal comparisons, unknown balances, explicit OKB shortage and unrelated errors.
- Browser fixtures in light/dark: network selection, exact address copying, retained amount/recipient on return, cleared form on cancel, failed refresh retains draft, X Layer USDC/stock/OKB, native Back, pending guard and ordinary deposit isolation.
- Existing send truth/sheets, POS confirmation, XPay quote expiry, bill routing, multi-recipient gift and Arc pending recovery checks.
- Focused TypeScript diagnostics: zero. Mobile and Android build checked separately before installation.

Tests use synthetic wallet responses. No live deposit, signing or payment is performed by these checks. Device-funded end-to-end settlement remains a separate manual test.

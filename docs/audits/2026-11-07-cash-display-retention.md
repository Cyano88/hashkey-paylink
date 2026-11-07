# Cash display retention: Bank Transfer, Bills and eSIM - 2026-11-07

Pixel showed Available cash / Refresh balance on the bank transfer amount page. The shared balance cache already retained the owner's Base-USDC value in displayRows, but these spending screens called pocketCashBalance in its default spend mode and reused that result for rendering. Spend mode correctly rejects stale data; using it for display incorrectly hid the retained value.

Bank Transfer and eSIM now derive displayCash with explicit display mode solely for PocketCashAvailable. Bills passes a separate displayCashBalance into its panel. Fresh-only cash.amount/baseBalance remains in shortfall checks, funding and payment logic. No cached value authorizes payment, no prior value is invented, no label says last known, and no provider/RPC behavior changes.

Verification: targeted TypeScript and native source guard passed. Browser regression uses the actual cash-component JSX from all three screens: a stale 12.50 balance stays visible during loading, fresh zero replaces it, an empty owner snapshot does not inherit the previous number, and the spending selector stays null for stale data. Cash selector tests and existing bank/Bills review checks passed. No bank transfer submitted during testing.

Captured screen: native output/bridge-swap-audit-20261105/balance-bank-refresh-current.png. No account identifiers are copied into this report.

Installed pocket-cash-display-retention-20261107.apk on Pixel. SHA256 F4332ECEACAB3E8AAE5256BFEEFFFFB9EF5D9D5483F21985A211022B23F75D6F; 1870 packaged assets matched dist; Android build passed. Source archive cash-display-retention-source-20261107.zip. Post-install amount page displayed 2.67 USD Available cash, matching Home, captured in balance-bank-cash-confirmed-display.png. Selected an existing recent recipient only to reach the amount screen; amount remained empty and no confirmation/payment was made. Failure/stale retention verified through browser fixtures; no live network outage induced. Backend unchanged.

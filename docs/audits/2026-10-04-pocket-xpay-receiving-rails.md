# Pocket XPay receiving routes

The checkout now separates bank/mobile money (existing Base-funded payout), XStocks and USDC on X Layer, and Stablecoins USDC on merchant-selected Base, Arbitrum or Arc networks. Ethereum, Polygon and Solana are not enabled by this change.

Stablecoins setup derives each receiving address from the authenticated owner's server-side Circle wallet link. Client-supplied addresses are ignored. Setup keys are terminal-owned and attachment retains the existing payment approval. Canonical checkout and receipt verification select the wallet for the selected, enabled network and reject missing mappings. Legacy merchants retain their previous address behavior; existing terminal identifiers and historical receipts are preserved.

In Pocket native checkout, confirmation and result sheets show a read-only snapshot of the payment options behind them. Closing returns to the options with the selection retained. This snapshot does not authorize payment or supply the canonical recipient. Public web navigation does not carry this native backdrop state.

Validation: unified setup, scan canonicalization, settlement routing, purchase registry, terminal UI, stock management/customer network selection, confirmation sheets in both themes, expiry, and USDC setup browser fixtures passed. Focused TypeScript diagnostics returned zero; the mobile production build and Android debug assembly passed. No live payment was submitted during this audit. Seeker is the update target; Pixel remains the stable baseline.

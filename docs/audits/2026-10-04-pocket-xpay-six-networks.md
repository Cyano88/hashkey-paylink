# XPay Stablecoins network completion

Stablecoins receiving setup now offers Base, Arbitrum, Arc, Ethereum, Polygon and Solana when the merchant has a linked wallet. Each address comes from the authenticated owner's server-side Circle link. Solana-only merchants do not need an EVM address. X Layer remains in the separate XStocks/USDC option; bank/mobile money retains Base settlement.

Ethereum and Polygon previously failed checkout initialization or used Base/Arc fallback metadata. Checkout now preserves the requested network, uses its USDC token and chain ID for balances and verification, and reuses Pocket's additional-network wallet controller for Circle signing. The inactive manual-address flow remains disabled. Existing hosted-checkout network configuration is unchanged.

Solana POS receipts now verify a successful confirmed transaction, payer signature, SPL Token program, native USDC mint, source and recipient token-account ownership, transfer authority, and sufficient integer USDC units. Outer and inner transfer instructions are supported, including newly created recipient token accounts. Bank settlement cannot use this receipt path. Verified Solana purchases retain case-sensitive wallet and signature identity in the receipt registry.

Validation includes six-network setup and canonical scan routing, Solana-only setup, invalid wallet/mapping rejection, Solana transfer proof and receipt-registration fixtures, merchant network UI, customer routing for Ethereum/Polygon/Solana, and existing bank/XStocks confirmation regressions. The focused type check leaves the pre-existing missing lucide-react declaration in NigerianPos; changed payment and server code has no reported diagnostics. Live funded payments are not part of this change's automated validation.

Solana proof parsing follows the official RPC transaction structures: https://solana.com/docs/rpc/json-structures and https://solana.com/docs/rpc/http/gettransaction.

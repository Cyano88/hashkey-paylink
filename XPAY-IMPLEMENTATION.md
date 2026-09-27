# Unified XPay implementation checkpoint

This feature checkout contains the initial shared XPay QR registry and UI. It is not a production-complete rollout.

Implemented and tested with synthetic fixtures:
- Owned destination discovery from existing active POS and XStocks merchant records.
- One reusable QR selecting bank/mobile-money or wallet payment destinations.
- Up to three distinct accepted assets, counting USDC once across receiving options.
- USDC added to the XStocks merchant asset picker; new/edited merchant configurations capped at three assets. Historical QRs are preserved.
- Authenticated creation with replay protection, destination revision binding, public reads without owner/credentials, PIN-protected deletion.
- Both home entry points and the scanner resolve the shared QR. Existing payment executors, receipts and QR paths remain intact.

Required before production rollout:
- Inline destination setup in the single creation flow (current draft reuses separate setup screens).
- Bind the unified QR ID to underlying payment attempts and aggregate per-QR merchant payment history; current draft still links the existing histories.
- Fixed-amount checkout support; draft currently supports reusable payer-entered amount.
- Stock-funded bank payouts: quote stock conversion, execute through the payer's Privy wallet, bridge native USDC to Base, prove arrival, then pay the merchant payout order. Persist each step, do not debit twice, handle expiry/recovery/refund, and present one fee-inclusive approval and truthful receipt.
- Full wallet/payment end-to-end checks before enabling the combined checkout for customers.

Verified provider documentation on 2026-09-27:
- Circle lists X Layer domain 37 with standard and fast CCTP support, but no source upfront fees or destination forwarding support: https://developers.circle.com/cctp/concepts/supported-chains-and-domains
- TokenMessengerV2 on X Layer: 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d, per https://developers.circle.com/cctp/references/contract-addresses
- Pocket already uses the native X Layer USDC contract listed by OKX. Pocket's current CCTP integration only implements its six Circle-wallet networks and relies on upfront forwarding fees. Do not simply add X Layer to that enum: it needs a Privy-owned source execution and a supported attestation/mint/fee path.

Tests:
- scripts/pocket-unified-xpay-smoke.mjs
- scripts/pocket-unified-xpay-browser-smoke.mjs
- Existing pocket-xpay-api-smoke and scan compatibility tests passed before isolation.
- Full repository type check has existing errors; it is not a clean passing baseline.

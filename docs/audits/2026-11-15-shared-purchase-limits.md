# Shared online and QR purchase allowance

## Approved scope

One Basic-verified buyer has a USD 7,000 equivalent purchase allowance each Lagos calendar day across online checkout and physical merchant QR purchases. Bank settlement additionally checks the current corridor capacity. Personal bank transfers, bills and marketplace earnings withdrawals remain separately counted. No Advanced personal-withdrawal daily ceiling was configured in this change.

## Findings and implementation

- Online wallet and bank checkout already shared a durable owner-keyed ledger. Ordinary QR paths did not consistently use it. Extended that ledger to canonical `ngpos` bank orders and added internal wallet-QR adapters after signed quote, recipient and payer ownership checks.
- Stablecoin QR supports Base, Arbitrum, Arc, Ethereum, Polygon and Solana in the current terminal setup. X Layer stock/wallet QR is a separate adapter; its accepted USD value is counted, with asset and token amount bound immutably. The bank bridge adapter converts on X Layer and pays through Base. These are actual route capabilities, not one universal chain-independent execution engine.
- Removed the X Layer payer's 100 prepared-records-per-24-hours block. Existing HTTP request rate protection remains. Quote previews and unsigned preparations do not reserve money; authorization does. Retries of an unchanged authorized payment count once. Concurrent online and QR purchases use the same locked ledger.
- Bound EVM QR execution idempotency to the signed quote ID. Solana QR retries return the first persisted partially signed transaction for that quote, preventing different blockhashes from turning one allowance reservation into multiple payments.
- Provider-confirmed bank refunds can restore allowance. Merely closing a dialog, expiration after authorization, an unknown failure or a caller-supplied failed hash is not sufficient release evidence. Conservative reservation retention is intentional until canonical execution recovery proves no payment can settle.
- Corrected stale docs claiming a dynamic daily allowance or excluding wallet checkout. Pocket now distinguishes Online and QR purchases from Personal bank transfers. Purchase KYC errors open Basic verification and do not display the NGN 50,000 personal-transfer allowance.

## Verification

Fixture tests cover shared online/QR amounts, mixed-rail concurrency, current bank capacity, stock USD valuation and immutable token bindings, Basic KYC, 120 non-consuming previews, retry idempotency, confirmed refunds, personal-transfer separation and Lagos reset. Existing checkout wallet tests cover eight supported hosted networks. QR handler and bank orchestration tests cover owner/PIN checks, quote expiry, lost-response recovery, exact provider amounts and settlement proof. Solana build tests cover concurrent retries and owner isolation.

Browser checks cover the distinct purchase/personal-transfer labels and usage recovery, plus all 21 developer documentation pages and the portal guide. These are controlled fixtures, not new live payment evidence. No transaction, email, provider gate or production limit environment setting was changed by testing.

Hosted checkout reservations retain their existing ledger. QR payments authorized before this deployment are not backfilled into that ledger; the unified policy applies to new authorizations. Existing submitted QR recovery remains available.

Web source build completed in 3m17s with dependency/chunk warnings (PowerShell surfaced native stderr as an error record despite Vite reporting completion). Android release assembly succeeded. Changed-file TypeScript diagnostics passed for the web/backend files and nine native source files. Native lineage checks passed. The APK contains the final purchase and personal-transfer labels and purchase KYC code; SHA-256 is `1D7D0393F1EBE1DB0609AE0E617541ED6E20447FD3441C67FF93EBCA1B63C40F`. ADB reported no connected devices, so this APK has not been installed or tested on the Pixel in this pass.

## Next XPay scope

Keep terminal identity and accepted payment options separate from adapters for source assets/networks, conversions and merchant settlement. The purchase policy belongs above those adapters. Expansion to another network or payment type still requires a verified adapter, not a renamed UI option. Preserve existing terminal IDs, payment recovery and receipts when restructuring.

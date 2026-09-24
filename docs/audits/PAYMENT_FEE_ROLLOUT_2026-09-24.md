# Payment fee rollout - 2026-09-24

## Implemented in this branch

- Shared checkout platform fee: 25 basis points (0.25%), using integer USDC base units.
- Circle email-wallet checkout: server-signed, 120-second quote bound to chain, wallet, recipient, amount and fee mode.
- Read-only Circle contract fee estimates for the recipient and treasury batch. Base/Arbitrum ETH is converted with a fresh ETH/USDC price; Arc native USDC requires no cross-asset conversion.
- The payer sees platform fee, estimated network recovery and total before authorizing. Changed or expired quotes require review again.
- Execution uses the quoted recipient and treasury amounts; balance checks include fees.
- Unverified client `feeBps: 0` cannot exempt this checkout. Existing Paycrest POS exemptions require a matching server-side payout record.
- Existing free Pocket-ID transfers and migration/withdrawal paths are not repriced.
- Existing Solana checkout platform fee uses the shared 25 bps constant. Its network recovery remains the existing policy.

## Verified locally

- Production web bundle compiled successfully. The final native web bundle also compiled successfully after merging the current live developer-portal commits and correcting fee documentation.
- Fee arithmetic, signatures, tampering, wallet/recipient/chain/amount binding and expiry tests pass.
- Mocked Circle quote generation and batch decoding verify exact recipient amount and treasury platform fee plus recovery. Retry keys remain unchanged within the mocked request retry.
- Unverified exemption, wrong-chain wallet, missing quote and altered quote submit no payment.
- Fresh-price caching, stale/future/zero prices and provider failure tests pass.
- Existing Circle EVM/Solana gas-station, Pocket payment-security and Solana token-security smoke tests pass.
- Full repository typecheck is not a passing release gate: an earlier run reported numerous repository errors; a repeated run stalled and was stopped. Do not describe typecheck as passing.
- The existing Render quote-signing secret is configured; its value was not printed.
- Android debug APK assembled successfully with Java 21 and passed apksigner verification. Package identity remains com.hashpaylink.pocket, versionCode 4, versionName 1.0.3. Artifact: android/app/build/outputs/apk/debug/app-debug.apk (35,450,272 bytes).
- No live payment or live authenticated Circle quote has been executed for this change.

## Release gate

Do not deploy the server quote requirement ahead of the matching mobile update: older APKs do not send a quote. The attached-device check currently finds no Android device. Preserve app data with an in-place debug APK update when the device is reconnected.

Current live developer-portal changes through aaab0a11a64d3125e568d828d3cb84c90b5730bd have been merged into the fee release working branch. Recheck deployment ancestry before publishing.

The main workspace contains unfinished Ethereum/Polygon edits. A check-only patch synchronization found conflicts in the chain definitions and payment retry test. No fee patch was applied to that workspace; reconcile its five-chain work before claiming full coverage.

## Coverage still requiring separate work

- Ethereum and Polygon payment execution is not enabled by this patch; existing wallet sponsorship groundwork is not checkout coverage.
- Legacy passkey checkout receives the shared platform rate but has no new dynamic recovery quote.
- Agentic Circle Gateway checkout currently settles to one recipient; platform splitting is not implemented by changing the advertised amount.
- xStocks/OKX swaps do not gain a 0.25% fee from this patch.
- Hosted checkout verification and durable receipts still need a versioned fee policy and verified treasury-transfer metadata. This patch enforces the quoted batch at the Circle execution endpoint, not every alternative wallet submission path.
- Gas recovery is an estimate, not the final Circle invoice. Circle sponsorship service charges/taxes are not added to this quote.

## Provider reference

https://developers.circle.com/api-reference/wallets/user-controlled-wallets/create-transaction-estimate-fee

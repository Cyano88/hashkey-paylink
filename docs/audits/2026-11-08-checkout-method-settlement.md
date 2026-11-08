# Checkout settlement by payment method - 2026-11-08

The owner confirmed Stablecoins pay the merchant receiving wallet and Cash balance pays the configured NGN bank. This supersedes the pending product question in 2026-11-08-checkout-funding-actions.md.

## Implementation
- Newly signed selection sessions separate wallet payment options from the bank fallback refund address. Existing signed sessions and fixed local-settlement APIs retain their original semantics.
- Stablecoin selection uses configured receiving wallets and rail rollout gates. Cash uses authenticated payer ownership, Base USDC funding and the existing bank provider. NGN-priced stablecoin orders support USDC/USDT.
- Stablecoin routes remain switchable before payment is claimed; switching to cash retires the old child and binds the cash payer. Cash preparation retries recover the same provider order.
- Portal/admin describe destinations separately. Cash-only merchants are supported on web and Pocket without an unusable Stablecoins option.
- Lunchroom fulfilment verifies authoritative status, actual settlement mode, asset and exact amount. Fee and webhook verification remain in place.

## Verification
Passed: web TypeScript, web source build, native source build and native lineage guard. Regression fixtures cover eight supported networks, saved recipients, route switching, old child rejection, cash ownership/refunds/replay, historical signatures, local settlement, hosted adapters, fee evidence, NGN price/fulfilment, and mobile/desktop browser selection. These are fixture tests, not live transferred funds.

## Live configuration boundary
Live Lunchroom policy has Base-only acceptance and no saved receiving wallets; BNB/X Layer configurations are absent. Owner-bound Circle and Privy receiving wallets were verified read-only. Saving them and enabling routes awaits the user's destination choice. Never repurpose the bank fallback refund address as the receiving wallet. Existing bank configuration is retained.

Deployment and final Pixel verification are recorded separately after completion. No payment has been signed or sent for this change.

## Shipped verification
- Commit 21f3a3c4ebf9f74661de9376dbe14a5b9f2070bb pushed; Render dep-dbo2a7hsrm7s73api91g reached live.
- Final native source build, source guard and Gradle passed. APK installed with adb install -r; Pixel package lastUpdateTime 2026-11-08 08:30:29, data retained.
- Live fresh Lunchroom selection chks_6c33200879c4402eb66b7136 displayed Cash balance as the only enabled method, reflecting its absent saved receiving wallets. Cash opened Pocket email sign-in with amount retained and no payer-name request. Browser recorded no errors (one existing warning).
- Pixel was in WhatsApp; no taps or checkout visual verification performed after installation. No funds sent. Stablecoin options remain pending explicit receiving-wallet configuration.

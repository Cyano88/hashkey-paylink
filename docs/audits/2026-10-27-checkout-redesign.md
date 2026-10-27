# Checkout audit and redesign decision

Audited 27 October 2026, against commit dc0e76e37. This is a design and implementation plan, not a claim that expanded payment routes are enabled.

## Agreed product boundaries

- Cash balance pays fiat orders: actual spendable Base USDC funds the approved provider payout. NGN and UGX use Paycrest; USD bank payout through Bridge remains unavailable until activated and tested.
- Direct crypto pays a business's configured receiving wallet in the selected asset and network. USDC is not USD bank settlement.
- Funding is a separate product with a server-bound destination. Completion requires delivery to that destination, not merely an intermediate Base transfer.
- A fiat order must not silently switch into crypto settlement or silently convert other wallet assets. Add cash is a separate, resumable action followed by fresh payment confirmation.
- Merchant receiving wallets may be Pocket wallets or verified external wallets. This does not reintroduce the inactive payer-facing manual-address/ghost-vault rail prohibited by AGENTS.md.

## Verified implementation findings

1. `api/hosted-checkouts.ts` currently restricts standard hosted checkout to USDC on Base, Arbitrum and Arc. Separate X Layer stock checkout exists; this is not proof of general USDe/USDG checkout support. Expanding a selector alone is unsafe.
2. `api/developer-projects.ts` forces NGN/UGX settlement onto Base and rejects X Layer asset acceptance for local settlement. Preserve this separation.
3. Managed checkouts reject caller-supplied recipient/paymentOptions/network overrides. Stored checkout integrity includes receiving destinations and payment options. Preserve immutable order destinations.
4. Merchant recipient configuration validates address format and owner authentication. It does not currently include wallet-control proof or fresh authentication specifically for changing a receiving address. Add signed challenges for self-controlled wallets and a separate documented authorization review for institutional/custodial destinations that cannot sign. Never describe address validation as ownership verification.
5. `PaymentPage.tsx` still resolves automatic cross-chain funding and chains payment after funds arrive (`handlePocketMoveAndPay`). Its balance input covers Base, Arbitrum and Solana, while the shared routing helper supports a broader set. This cannot serve as the new universal cash-balance design.
6. `checkoutCircleSession.ts` already binds session restoration to account, app, device and wallet. It uses session storage and does not persist the SDK encryption key. Preserve this model; do not promise cross-browser or cross-device automatic sign-in.
7. `checkoutCompletion.ts` requires relevant transfer, checkout, payout and funding evidence. Keep payment acceptance and payout delivery as distinct states rather than loosening proof requirements to accelerate the success screen.
8. Existing browser confirmation shows a separate review sheet and provider-oriented fee rows. Replace redundant navigation with one stable order card, while retaining required wallet authorization.

## Recommended checkout structure

One compact, responsive Hash PayLink card inspired by Link's progressive sign-in experience, with original branding.

1. **Order summary:** merchant mark/name, item or purpose, amount. Load trusted order data first; do not reveal balances or personal details before authentication.
2. **Sign in:** Continue with email using Privy OTP. Reuse a valid authenticated session. Allow change-account and keep order state intact across login or cancellation.
3. **Wallet access:** restore the matching linked wallet session where possible. Show Circle email verification only when required for Circle wallet access. User-facing copy says Verify your wallet; it must not imply that Privy and Circle codes are interchangeable. Never silently create a replacement wallet when linking/restoration fails.
4. **Payment:** fiat order shows Cash balance and the exact debit, fees and fiat recipient amount. Crypto order shows only merchant-accepted asset/network combinations, with explicit token amount and fees. Keep the destination fixed server-side.
5. **Approval:** Pay [amount] invokes the wallet's required user-controlled approval. Login alone is not payment consent. Use the existing Circle/Privy authorization path appropriate to the actual wallet; do not add automatic signing.
6. **Result:** remain in the same stable card. Represent Awaiting approval, Submitted, Confirming, Payment received and Payout processing/completed separately. A submitted payment is resumable after closing the page. Closing before submission cancels the approval, not a completed transfer.

Insufficient cash: Add cash -> confirmed balance update -> return to original order -> explicit Pay confirmation. Expired quotes refresh through Continue before approval; material price/fee changes require a new review. Unknown payment status triggers reconciliation, never another send.

Only activated payment methods appear on payer checkout. Coming-soon provider routes belong in developer setup. Wallet login is not payer KYC or merchant KYB; gate regulated routes with the required verified eligibility.

## Implementation sequence

1. Introduce an explicit immutable order mode (fiat payment / crypto payment / account funding), capability checks and state model while preserving old checkout identifiers and signatures.
2. Build the responsive order card and embedded Privy sign-in; connect existing verified wallet-session restoration and conditional Circle verification.
3. Implement cash-only fiat payment and resumable Add cash, removing automatic bridge-and-pay from this new path.
4. Harden receiving-wallet setup, then add each supported crypto asset/network through creation, quote, authorization, proof, receipt, webhook, Activity and recovery tests.
5. Activate bank funding/USD payout only after provider approval and route verification. Preserve Polymarket-specific destination and funding restrictions.

## Tests performed

- Checkout completion smoke: transfer, checkout verification, bank delivery and funding proof gates; reverted payments never succeed.
- Pocket checkout routing smoke: shortfalls, fees, unavailable balances and unsupported automatic source handling.
- Hosted checkout adapter smoke: payment policy, local settlement, idempotent delivery and failure boundaries.
- Checkout Circle session smoke: token refresh, account/device isolation, wallet binding, expiry, outage retention and logout race.
- Real Chromium synthetic browser sheet tests at 390px and 1280px, light/dark: keyboard confirmation, close before sending, one submission, pending state, status checks without resending, no horizontal overflow. Mobile screenshot visually inspected.

No live payment, OTP challenge, provider account mutation, or Pixel test was performed for this audit. No production checkout behavior was changed.

## Design references

- https://stripe.com/payments/link
- https://docs.privy.io/authentication
- https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-user-controlled-wallets/SKILL.md

## Implementation and verification - 27 October 2026

Implemented the two-entry standard hosted checkout: Pay with Pocket and Continue in browser. Both retain the stored checkout and attempt; Android uses the installed Pocket package with a browser fallback, and desktop exposes the same order as a QR. Paid/processing lookups resume verification instead of offering a new payment.

The browser card uses inline Privy email verification, existing Circle wallet restoration/authorization, the actual selected-network USDC balance, and the payer's own verified funding address. Fiat checkout stays on the server-selected Base USDC route. Funding polls balance while visible and never submits a payment. Returning from funding is immediate; Pay securely remains an explicit action. Fixed/flexible amounts and required payer names are retained. Change account clears the authenticated wallet surface through the existing session lifecycle.

Automatic bridge-and-pay is disabled for browser hosted checkouts. Network selection only includes existing merchant-enabled routes. The server-bound merchant destination is unchanged. Fresh fees are fetched before wallet approval; a changed total or recipient amount requires another review. Account changes during approval stop submission. Existing completion checks still require the appropriate transfer, checkout and payout proofs.

Read-only quote calls now have a 12-second timeout and checkout lookups a 15-second timeout. Cancellation says Payment cancelled. Errors appear above the action; fee/balance placeholders use shimmers, actions do not. Existing Arc session-lock promise inference was corrected without changing the lock or persistence contract.

Verification:
- Chromium card tests: 320/390/1280px, light/dark; no overflow, no payment on app handoff or funding, explicit approval, duplicate-tap lock, cancellation recovery. Funding screenshot visually reviewed.
- Entry tests: verified order continuation, paid/processing recovery, expired and mismatched order rejection; no write requests.
- Handoff tests: order/attempt preservation, native parser compatibility, encoded Android fallback, invalid reference and intent injection rejection.
- Existing checkout completion, hosted adapter (including UGX delivery/idempotency), wallet session ownership/refresh and routing tests rerun.
- Arc persistence regression: refresh rotation, owner/device/wallet isolation, outage retention and logout/navigation races passed.
- Connected Pixel 10 Pro: app.hashpaylink.com and pocket.hashpaylink.com verified; Android resolves the hosted checkout URL to com.hashpaylink.pocket/.MainActivity.

Limitations: browser tests use deterministic fixtures; no live OTP, funds transfer or bank payout was executed. Pixel checks verify association and activity resolution, not a live checkout approval. Standard hosted crypto remains USDC on Base/Arbitrum/Arc; additional asset routes, merchant wallet-control proof, USD bank activation and funding-specific redesign are separate work. The native repository was not overwritten or rebuilt.
- Final scoped TypeScript check and production Vite build passed. Existing third-party annotation/chunk-size warnings remain non-blocking.

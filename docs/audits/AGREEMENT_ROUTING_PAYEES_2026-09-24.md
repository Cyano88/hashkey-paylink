# Agreement routing and payee audit - 2026-09-24

## Findings and fixes
1. The shared developer settings selector used checkout mode rather than selected products. Agreement-only projects displayed Base/Arbitrum. Fixed with shared product-aware network policy in portal, configuration validation, policy resolution and key issuance. Agreement-only configuration accepts Arc USDC; Base/Arbitrum are rejected server-side. Mixed-product projects retain their supported routes and explain that Agreements use Arc only.
2. Receiving-address copy incorrectly implied every worker payout should reach a platform treasury. Updated it to distinguish the fixed project recipient from the separately verified per-account recipient integration and escrow funding.
3. Hash PayStream already has a provider-recipient flow in api/service-requests.ts. It verifies the request roles and accepted terms, reads the provider account wallet, signs recipient registration with API-key binding and a short timestamp window, then creates the draft. Hash PayLink enforces project-scoped registry lookup and rejects account reassignment for an existing registered address.
4. This is backend attestation, not standalone cryptographic proof that a wallet is on mainnet or controlled by the named person. The deployed Hash PayStream account schema has a chain-less walletAddress and the active integration is still testnet-based. Mainnet provenance must come from a verified production Circle wallet and owner/account binding before registering recipients.
5. Newly added agreement:read/create credentials intentionally cannot call verified-recipient, project-payer or lifecycle routes. They cannot complete the existing end-to-end service-request flow. Do not promote this preparation key as a production integration key or expand permissions implicitly.
6. Mainnet Agreement release remains unreviewed/unregistered. No keys issued, recipient configuration mutated, contracts deployed or funds moved by this audit.

## UI request
Added a shared developer top navigation with the existing Hash PayLink logo and Need help? linking to mailto:support@hashpaylink.com. Removed the duplicate workspace brand heading. Retained page sign-out.

## Validation
Developer project adapter (including new Agreement-only Base/Arbitrum rejection and Arc acceptance), scoped-key regression and scoped typecheck passed. Synthetic real-browser checks verified Agreement-only choices, USDC-only settlement, saved Arc-only payload, help email and no mobile overflow. Preview screenshots inspected; corrected logo inversion to match existing checkout branding. Full build and post-deploy verification are recorded after release.

## Next production dependency
Implement a verified production Circle account-wallet binding and isolated mainnet recipient registration; review the required per-action backend permissions and payee lifecycle separately, then complete contract/operator release review and a bounded canary. Do not replace every worker wallet with a platform receiving address to satisfy project readiness.

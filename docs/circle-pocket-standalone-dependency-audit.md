# Circle Pocket Standalone Dependency Audit

Date: 2026-07-16

## Scope

This audit records the current source boundary after the Pocket API adapter cutovers. It does not redesign the accepted Circle Pocket UI, create a second repository, or claim production verification.

## Current mount

- `src/App.tsx` exposes `/pocket/*` through `CirclePocketApp`.
- `CirclePocketApp` resolves the canonical Pocket route. Smart Wallet Home, x402, every Move route, Bills, and Activity mount Pocket-owned pages; only Assistant still mounts `CreateLink` with `initialProduct="circle-pocket"`.
- There is no `pocket.hashpaylink.com` or `?app=pocket` hostname switch yet.
- The Pocket route still renders inside the shared `Layout` and `SolanaProvider`.

## Blocking product dependencies

These dependencies still prevent Circle Pocket from being a standalone frontend boundary.

| Boundary | Current source | Why it is blocking | Clean successor |
| --- | --- | --- | --- |
| Application shell | Assistant in `src/pocket/CirclePocketApp.tsx` still falls through to `src/pages/CreateLink.tsx` | That Pocket route still mounts the complete Hash PayLink create/service page and its product state | Extract only the accepted Pocket assistant surface after its conversation transports have a Pocket contract |
| Business state | `CreateLink.tsx` still owns the transitional Assistant orchestration | The remaining Assistant route has not fully left the Hash PayLink page | Keep its extraction separate from x402 and preserve confirmed actions on their existing verified boundaries |
| Assistant | Pocket assistant mode mounts `TelegramHelperPanel` from `TelegramPaymentLinks.tsx` | The imported module contains Hash PayLink, NG-POS, Agent Hash, and PolyDesk transports and state | A Pocket assistant component and `/api/pocket/agent/*` contract, preserving accepted Pocket copy and behavior |

## Remaining API facade gaps

| Contract from the architecture | Current state |
| --- | --- |
| `GET /api/pocket/session` | Not implemented |
| `POST /api/pocket/paylinks` | Not implemented and not required for direct USDC: deterministic PayLink URL construction and draft/result/share behavior are Pocket-owned pure/client operations |
| `POST /api/pocket/bills/quote` | Not implemented |
| `POST /api/pocket/bills/pay` | Not implemented; current Bills surface remains provider-pending presentation |
| `POST /api/pocket/agent/ask` | Not implemented |
| `POST /api/pocket/agent/confirm` | Not implemented |

`GET /api/pocket/x402`, `POST /api/pocket/x402/connect`, and `POST /api/pocket/x402/activate` now form the bounded x402 wallet facade. All require a verified Privy bearer token and derive the legacy wallet namespace and Circle email from that verified identity on the server. The read route permits only Base or Arc and returns a sanitized wallet/Gateway balance snapshot. The connection route preserves OTP send/resend, OTP completion, expected-wallet selection, and bounded multiple-wallet choices. Activation accepts only 0.5–5 USDC on Base or Arc and claims a durable idempotency record before calling Circle. None accepts an email or agent slug from the browser or returns raw Circle CLI output.

`readPocketRecipientBalance` now calls public read-limited `/api/pocket/balances/recipient` for its Solana preview. Its EVM equivalent remains the existing browser-side public `balanceOf` read. The legacy `/api/solana-balance` route remains only for non-Pocket compatibility.

## Intentionally shared infrastructure

These imports do not by themselves block the first in-repository migration:

- Privy authentication bootstrap and `PrivyConnectButton`.
- Chain metadata, address/amount formatting, and reusable UI utilities.
- Circle EVM and Solana wallet SDK helpers used for user-approved signing.
- React, React Router, `viem`, icons, QR rendering, and the shared `SolanaProvider`.
- Server domain functions behind Pocket adapters, including NG-POS history/merchant/bank operations, balance readers, durable storage, and payment-purpose wallet persistence.
- Existing public PayLink and receipt origins, which remain Hash PayLink-owned by the architecture decision.

The legacy `/api/ng-pos`, `/api/privy-circle-link`, `/api/solana-build-tx`, and `/api/solana-relay` routes remain registered for non-Pocket compatibility. Their existence is not a Pocket frontend dependency after the completed caller cutovers.

## Completed Pocket boundaries

- Smart Wallet Home, Bills, and Activity render through Pocket-owned pages instead of `CreateLink`; they reuse the accepted panels, extracted hooks/controllers, route model, and shared route shell without inventing product behavior.
- Canonical Pocket route model and extracted Home, Move, Bills, Activity, navigation, form, and result presentation components.
- Authenticated Pocket profile, wallet read/link/unlink, multi-wallet balances, activity, POS, bank receive, bank metadata/verification, bank send, and Solana transfer adapters.
- `/pocket/home/x402` now renders a Pocket-owned controller/page for Base/Arc selection, Privy sign-in, create/link choice, OTP send/resend/completion, balance refresh, source-faithful funding link, and replay-protected Gateway activation.
- Pocket EVM withdrawal client boundary with linked-wallet/session matching and unchanged Circle approval.
- Pocket command policy manifest has no `legacy-page-only` command.
- For `/pocket/*`, `Layout.tsx` derives the top selector mode and active item from the canonical route and navigates with `pocketPathFor`. The custom Pocket window events remain only for the old embedded Hash PayLink compatibility surface.
- `usePocketIdentity` owns Privy identity normalization, `usePocketWallets` owns authenticated linked-wallet hydration and balance refresh, and `usePocketActivity` owns authenticated activity loading and ordering.
- `CreateLink.tsx` no longer imports `usePrivy`, `readPocketLinkedWallets`, `readPocketBalances`, or `readPocketActivity`; wallet creation and signing still update or consume the Pocket-owned snapshots through explicit hook results.
- `usePocketWalletController` owns existing-wallet reuse, Circle EVM/Solana session creation and caching, payment-purpose wallet-link creation, returned version mapping, and stale recipient-intent cancellation.
- `CreateLink.tsx` no longer connects or links Circle wallets directly and no longer imports Circle withdrawal signing or transfer clients. `usePocketWithdrawalController` owns Home withdrawal draft, validation, pending/result state, Solana signing/submit, EVM execution, refresh, and activity feedback.
- The remaining unlink presentation is part of the PayLink email-recipient flow, not Smart Wallet Home; no new Home disconnect action was invented.
- `usePocketProfile` owns authenticated payout-profile loading, signed-out clearing, draft/edit state, versioned saving, and load cancellation across identity changes.
- `CreateLink.tsx` consumes the Pocket profile snapshot/actions and no longer directly reads or saves the profile adapter.
- Recipient Solana USDC preview uses `/api/pocket/balances/recipient`; Pocket frontend source no longer knows the legacy Solana balance URL or request field.
- Direct USDC PayLink URL construction is Pocket-owned and contract-tested across single/multi-chain, fixed/flexible, event, FX, and agent parameters; it remains a pure local operation rather than an invented server mutation.
- `usePocketRecipient` owns direct-USDC Circle recipient connection/reuse, stale-run cancellation, login-intent recovery, payment-purpose unlink, and balance preview. `CreateLink.tsx` no longer imports those recipient transports.
- `/pocket/move/usdc` renders `PocketMoveUsdcPage` without mounting `CreateLink`. Its Pocket-owned controller preserves amount/address validation, flexible and multi-chain state, deterministic link generation, copy/share, QR download, dashboard URL, and reset behavior.
- `/pocket/move/bank` renders `PocketMoveBankPage` without mounting `CreateLink`. Its controller preserves public bank discovery, authenticated verification, payout-profile readiness, NGN validation, retry-stable idempotency, authenticated link creation, result/share state, and QR behavior through the existing Pocket adapters.
- `/pocket/move/pos` renders `PocketMovePosPage` without mounting `CreateLink`. Its controller preserves the accepted Nigeria country/setup/ready route state, payout-profile gate, public bank discovery, authenticated verification, retry-stable merchant creation, static payer link, dashboard link, and copy feedback.

## Next clean implementation slice

All Home and Move routes are now outside `CreateLink`. Assistant is the only transitional Pocket route. Its behavior remains interleaved with the larger Agent Hash/PolyDesk conversation module, so the next clean step is a bounded Assistant contract decision rather than importing that module into Pocket.

## Verification still required

- Signed-in Privy wallet restoration and isolation in the real browser.
- Circle EVM and Solana confirmation/signing flows with linked wallets.
- Refresh, Back, and Forward on every Pocket route after event removal.
- Production-host registration and exact-origin configuration for Privy, Circle, CORS, CSP, and redirects.
- Pocket-specific PWA manifest, service-worker scope, offline behavior, and update flow.

None of these live or production checks is claimed complete by this audit.

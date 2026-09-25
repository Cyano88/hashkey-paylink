# Shared wallet Swap

Hash PayStream Home exposes Send, Receive, Swap, xStocks. Swap offers USDC on Arc and xStocks on X Layer. It opens a project-bound Hash PayLink wallet session; no signing is added to the Hash PayStream embedded Privy wallet. A connected Hash PayLink wallet is a separate wallet authority; connection does not move or merge balances.

## Builder API

Use a separate live `wallet:swap` key. POST `/api/v2/wallets/swap-sessions` with an `Idempotency-Key` (16-128 safe characters) and `{ "rail": "arc" | "xlayer", "userId": "did:privy:..." }`. Obtain the participant ID from the verified wallet-connection flow, not an untrusted client field. Response `session` includes ID, project name, wallet authority, network/chain and `/wallet/swap/:id` checkout path. Retrying the same project reference returns the same session; changing the participant or network conflicts.

The authenticated participant POSTs `/api/v2/wallets/swap-sessions/participant` with `{sessionId,action:"read"}` for metadata. Custom interfaces use `{sessionId,action:"request",method:"GET"|"POST",payload,token?}` with the Hash PayLink participant Bearer token. Builder keys are rejected on this route. Arc GET returns tokens/pending state (optional `token` discovery); POST supports Pocket's existing `quote`, `execute`, `status`. X Layer POST supports `quote` and `verify`; signing and receipt recovery remain in the user's wallet. Arbitrary contract execution is not exposed. Existing cross-origin application restrictions still apply.

Quotes and Arc action records use a project-and-participant namespace. Actual wallet ownership is checked against the participant's existing Circle link or embedded Privy account. Native token limits, exact amount/router/recipient validation, approval limits, quote expiry, slippage/fee checks, simulation and receipt verification are reused from Pocket.

## Reused UI and rollout

`WalletSwapPage` directly renders `PocketArcSwapPanel` or `PocketStockTrade`/`usePocketStockWallet`. Optional request adapters preserve all default Pocket call sites. X Layer retains Pocket payment security/approval, transaction validation and uncertain-submission recovery. Arc retains its Circle authorization and atomic approval/swap/revoke batch. Account changes unmount the flow and invalidate outstanding responses.

Rollout requires `HASHPAYLINK_WALLET_SWAP_ENABLED=true` and the project ID in `HASHPAYLINK_WALLET_SWAP_PROJECTS`. Project wallet capability/readiness is rechecked for new requests. Pausing prevents new quote/execute/verify requests while existing status recovery remains available. The original stock-read and Arc-wallet keys gain no swap permissions.

CLI `hosting plan --product wallet-swap` accepts only `wallet:swap`, targeting `HASHPAYSTREAM_WALLET_SWAP_API_KEY` on Render. Hash PayStream also needs its previously reviewed hosted account configuration. Never put this key in a VITE variable.

This release covers same-chain swaps. It does not add an X Layer/xStocks bridge or expose CCTP as a stock bridge. Existing Pocket bridge behavior is unchanged. Shared builder bridge adapters and combined project money-history presentation are separate outstanding work.

Validation: scoped-session tests; authenticated Hash PayStream proxy and UI tests; existing Arc route/quote/receipt and xStocks execution suites; scope isolation and CLI handoff tests. The Arc regression fixture was updated to provide the chain ID and finalized block already required by production verification. Full platform TypeScript still has unrelated existing errors; no modified swap module appeared in the diagnostics. Deployment and funded two-account transaction results are recorded separately.

Read-only production provider probes returned executable quotes for Arc (chain 5042) and X Layer (chain 196). These checks used a synthetic public address and performed no signing, approvals, swaps or bridge transfers. They establish quote availability, not successful funded execution.

## Release verification

Swap code deployed to Hash PayLink at 90a2db50dfaf6e248cd7ef5b84c6aca5419d5cda (Render dep-dar4jl3acf2s73a4uk60), and Hash PayStream at 482fd1d79f369752a018f82d26ea54cea95d8270. Live participant requests without authentication return JSON 401; missing developer credentials return JSON 403. The owner approved the dedicated scopes. The wallet:swap key was created and its Render handoff verified without displaying the secret; expiry is 2026-10-25.

Activation uncovered a missing xstocks_agreements project capability. The portal now exposes the existing capability as a human-project add-on, preserving the existing settlement routing. The Trade key creation correctly returns 409 until the project owner saves this capability. No capability or financial gate was bypassed. Swap and hosted account configuration have been saved, pending activation deployment. Trade remains disabled until its separate key and project configuration are complete.

Android versionCode 46 / 1.0.45-candidate built successfully; APK SHA-256 299BADD653FB7FF9D1AD8524E82A6DC268A3D8DE61B6F866C3980D77DD654256. Packaged HTML matches the mainnet build. Installation is pending because Pixel 5A160DLCH006VM disconnected before adb install. No live payment was executed.

Final portal release 00ac0e30c2e176cb6b503ec662b5b697978c48fb is live at Render dep-dar55qjncjis73c5shu0; /api/health returned JSON 200. Hash PayStream activation deployment dep-dar54rjtqb8s73fiigu0 is live; /healthz returned JSON 200. Swap rollout is enabled for dev_25f636321f644b4284, with per-network capability checks still enforced. Owner must select xStocks in project Settings before the xStocks Trade key can be created. Browser control failed, so the portal was opened in the owner Chrome profile for this remaining setting. Pixel remains disconnected.

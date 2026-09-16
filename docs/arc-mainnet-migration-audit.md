# Arc mainnet migration audit — 2026-09-16

Status: source migration and Pocket swap implementation prepared. This is not a production rollout or a complete application security audit.

## Verified network and provider facts

- Arc mainnet chain ID: 5042; RPC: https://rpc.mainnet.arc.io; explorer: https://explorer.arc.io.
- Official USDC precompile: 0x3600000000000000000000000000000000000000. ERC-20 units use 6 decimals; native units and system transfer events use 18 decimals.
- CCTP domain 26. Arc outbound uses standard finality (2000); eligible inbound source routes can use fast finality (1000).
- LI.FI lists Arc mainnet and returned a read-only USDC/EURC quote. Router: 0xA4072583658Fae592A3506A42431cb6316a8d40b. The live quote passed calldata validation.
- No funded bridge, swap, contract deployment, or signature was executed as part of this verification.

Primary references:
- https://docs.arc.io/arc/references/connect-to-arc
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/arc/references/usdc-system-events
- https://developers.circle.com/cctp/concepts/supported-chains-and-domains
- https://github.com/lifinance/contracts/blob/main/src/Facets/GenericSwapFacetV3.sol
- https://li.quest/v1/chains

## Source changes

| Area | Migration |
| --- | --- |
| Shared network clients, balances, explorers | Arc 5042, mainnet RPCs, explicit mainnet configuration |
| Circle Pocket wallets | Production ARC wallets; isolated Arc wallet-link storage; reject cached testnet wallets |
| CCTP | Arc added to EVM/Solana bridge routes; standard/fast finality selected by source; grossed-up integer fees; destination arrival required for completion |
| Pocket swaps | Arc-only LI.FI token discovery, quotes, simulation and Circle SCA approval/swap/revoke batch |
| Swap authorization | Privy owner binding, Circle signing, short-lived signed quotes, exact amount and router/recipient checks; own-wallet swaps do not require the additional Pocket payment PIN |
| Swap recovery | Durable idempotency journal, reopening recovery, Circle-confirmed failed/expired challenge recovery, receipt validation against actual token debits/credits |
| USDC receipts/activity | Native system events scaled to six-decimal accounting; ignore duplicate precompile transfer events |
| Developer routing | Live keys only for mainnet; saving routing explicitly records Arc 5042; old Arc hosted checkout records rejected; retired keys remain revocable |
| Agreements | Mainnet credentials, chain settings and isolated stores; activation blocked until a reviewed mainnet release is configured in source |
| Legacy contracts | Removed known testnet factory defaults; separate mainnet env names; Circle legacy vault actions blocked pending verified deployments |
| Agent wallets | Circle CLI pinned to 1.1.0 for Arc mainnet; tuple/raw-calldata patches retained and tested |
| Operational tooling/docs | Mainnet deployment manifests, operator provisioning/preflight, explorer settings and documentation |

The Pocket swap endpoint is authenticated for Pocket users. It is not yet a public third-party developer swap/bridge API. Token availability depends on provider discovery and a valid liquidity route; “any token” is not guaranteed.

## Verification

Passed:
- Production Vite build (with existing large-chunk and dependency annotation warnings).
- New Arc swap/mainnet security smoke: chain/router/recipient restrictions, amount precision, quote ownership/tampering/expiry, actual transfer-backed settlement, CCTP fees, native USDC duplicate prevention.
- Arc mainnet boundary smoke.
- Circle CLI tuple and raw-calldata smoke.
- Circle EVM Gas Station policy smoke, including rejection of retired ARC-TESTNET wallets.
- Pocket bridge adapter smoke.
- Hosted checkout adapter smoke.
- Developer projects adapter smoke.
- Pocket PIN/payment security smoke.
- USDC transfer verification smoke.
- Targeted swap API TypeScript check (re-run after final recovery changes; see final validation output).

Full repository typecheck was not clean in the initial run: existing PolyStream typing/lib-target errors, missing lucide-react declarations, and bank-withdraw liquidity typing were observed. A later full check was stopped after prolonged resource use. Do not claim a clean full-repository typecheck or a live end-to-end financial test.

## Production blockers and rollout work

1. Configure production Circle user-wallet credentials/app ID and an active Gas Station policy for ARC. Reconnect or create mainnet wallets; do not reuse testnet wallet IDs.
2. Set PRIVATE_RPC_URL_ARC_MAINNET and VITE_RPC_URL_ARC_MAINNET as appropriate. Set a stable POCKET_SWAP_QUOTE_SECRET (32+ random characters) in the server secret manager; never expose it in VITE variables.
3. Configure durable storage before enabling swaps. Requests with ambiguous provider submission and no recoverable challenge remain blocked for reconciliation, rather than being resubmitted.
4. Review and deploy mainnet Agreement/Stream/Checkpoint/Arena contracts separately. Verify bytecode, owner/operator roles, initialization and chain ID before populating mainnet addresses. Agreement activation currently fails closed; legacy Circle contract actions remain disabled.
5. Resave each developer project's Arc mainnet recipient routing. Generate new checkouts; existing unversioned Arc hosted checkout records cannot be reused on mainnet. Review/reissue older unsigned shared payment links before promotion because their historical URLs may not encode a chain ID.
6. Run controlled wallet-backed bridge/swap tests, including cancellation, expired challenge, unavailable liquidity, interrupted session and destination settlement. No mainnet funds were moved by this audit.
7. Deploy the backend/web build and rebuild Pocket mobile artifacts. Deployment and mobile store publication were not performed here.
8. Roll back through a separate deployment if necessary; do not repoint new mainnet storage or credentials at retired testnet stores.

Historical testnet fixtures, archived evidence and controlled testnet scripts are not evidence of active mainnet readiness. Existing archive IDs and financial records are not rewritten by this source migration.

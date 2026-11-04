# Arc balances, RPC and combined EURC recovery - 2026-11-05

## Verified runtime and checkout
- Backend: C:\Users\USER\hashpaylink-recovery-release-20261104, branch release/pocket-recovery-20261104.
- Native Android source: C:\Users\USER\pocket-play-update-20261101. Do not build the old exchange checkout.
- Balance commit 0b460f63f8822eb6f55868257d4c720a3177f33f, Render deploy dep-dblrgk6i0phs7386ujpg live; health 200.
- User saved PRIVATE_RPC_URL_ARC_MAINNET in Render. After deployment the runtime host is arc-mainnet.g.alchemy.com (never save the full credential URL).
- Chain ID 5042, finalized receipt, nested callTracer, readBridgeProofEvmRpc and readFinalizedBridgeSource all verified against public transaction 0x80539195ba2c58eae861650d81ef13a72e1602cb7369b626689382e23d75d02e, block 29572822. Finality recheck passed at height 29572988.
- Previously configured rpc.mainnet.arc.io returned -32601 for debug_traceTransaction. This was a method-capability problem, not missing configuration.

## Display balance behavior
- Main stablecoin display and per-network display use Circle first, RPC fallback.
- Arc token catalog and quote display now use owner/token-bound Circle reads, cache and RPC fallback. Execution still checks fresh on-chain balances and simulates.
- EURC on Base and Arc uses the same Circle-first pattern, exact six-decimal raw units and market USD pricing (no EURC dollar peg).
- Native holdings and missing Circle USDT balances now have RPC fallback.
- X Layer and BNB wallets retain their actual wallet-provider display readers. They are not Circle-owned wallets.
- Live Circle API reads returned 200 and six-decimal rows for Arc USDC and EURC, without RPC.
- Passed Circle token display regression, Circle USDT, native balance API, balance adapter, EURC balance and Arc swap tests. Broader pre-existing pocket-provider-balances-smoke reaches an unrelated OKX fixture failure: omitted requested USDE/USDG assets; do not report that entire script as passed.

## Combined EURC route
- Commit 3d3eacf34dafd0ece2c19f5f5f5ef384e2f2d6ea, deploy dep-dblroe15efls73ak0dv0 live; health 200. Fresh production conversion + Relay quotes validated Base -> Arc and Arc -> Base with eight source calls and over 41 seconds remaining in quote validity.
- Arc LI.FI or Base OKX EURC->USDC conversion plus Relay direct USDC deposit in one Circle executeBatch, with exactly one final EURC reimbursement.
- Only the validated minimum source USDC output is bridged; extra USDC stays in source wallet. Native confirmation explains this.
- Base route preparation reuses the existing router validator but does not estimate an unnecessary standalone ETH fee. The complete combined batch is estimated and rechecked.
- Source proof binds the exact charged batch and outgoing calls, EURC net debit/fee, and exact USDC bridge deposit. Destination proof remains independent.
- USDC refunds are bound to signed provider refund options, exact finalized delivery, and capped by the actual USDC deposit.
- Both direction provider payloads recorded with dummy public wallet in scripts/fixtures/cross-bridge-eurc-{arc,base}.json; no wallet credentials.
- Passed combined both-direction mutation/refund/expiry/recovery tests, 496 provider route fixtures, Circle source/runtime, reimbursement/prices, settlement/delivery, operation/recovery/API and native swap tests.
- Native shared review browser test passes existing seven routes plus Arc EURC -> Base EURC and reverse, conversion explanation, stale quote rejection, exact presets and locks.
- No funds moved. Provider quote and synthetic proof checks are not a funded end-to-end settlement.

## Native release
- Installed prior layout APK pocket-arc-bridge-layout-pixel-20261104.apk on Pixel 5A160DLCH006VM, package com.hashpaylink.pocket. SHA256 2F8DF5DB5AECB1D2EF3437FF1B7A901EDEEAC7F37902800AA8A393D91942B48E; 1866 packaged assets verified.
- Live screenshot: output/arc-selector-recovery-20261104/bridge-layout-arc.png in native source tree.
- Combined EURC APK built, signed, 1867 packaged assets verified, and installed -r: native-release/pocket-combined-eurc-pixel-20261105.apk. SHA256 BAEBF428EBE0DCD45371A8B0E4E3FF21F521E7D0ADF7F0CD6FBA4B285EBE59D5. Record native-release/combined-eurc-pixel-20261105.json includes source hashes.
- Native code has Arc in the shared cross-bridge selectors, Base EURC enabled, and conversion note in shared bridge review. Legacy CCTP recovery retained.

## Final device verification
- Arc source sheet shows 0.65 USDC (~0.65 USD) and 0.61 EURC (~0.68 USD). Base sheet shows native ETH, USDC, USDT and EURC with the shared decimal formatting.
- Actual authenticated Arc -> Base EURC quote reached the existing confirmation sheet: 0.50 EURC input, 0.03 fee, 0.53 total, estimated 0.47 EURC received. This includes live owner-wallet resolution and Circle combined-batch fee estimation. Confirm bridge was NOT pressed; review closed and amount cleared.
- Reversing selected Base -> Arc EURC -> EURC, with known Base EURC balance 0.00.
- Evidence in native output/arc-selector-recovery-20261104: combined-eurc-token-sheet.png, combined-eurc-base-sheet.png, combined-eurc-review.png, combined-eurc-reverse.png.
- Additional browser proof: Arc uses one existing device approval and one source dispatch in the mocked lifecycle; no premature success after remount.
- Home total recovered to 10.61 USD, now including the approximately 0.68 USD EURC holding; cash balance remains 1.11 USD. Evidence: combined-home-total.png.

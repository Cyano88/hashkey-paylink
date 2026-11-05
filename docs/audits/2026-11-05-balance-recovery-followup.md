# Pixel balance recovery and token-switch follow-up - 2026-11-05

## Changes
- Cross-chain arrow exchanges tokens only, preserving source and destination networks. It is disabled when the opposite token is unsupported or both tokens are identical. Fixed-token legacy bridge fields no longer expose an arrow that reverses networks.
- Main Circle balance reader refreshes immediately on browser online events; first failed-read retry is five seconds, backing off to sixty seconds. Wallet-revision binding, owner isolation and non-spendable stale values remain intact.
- Asset selector unknown amounts use an updating indicator and the existing sheet refresh action instead of a bare dash. Home/stock missing totals and available-balance panels expose refresh. Stock available amounts use the common asset formatter.
- Earn failed balances/rates no longer use bare dashes. Rates, positions and earned-interest reads recover on reconnection; position recovery occurs in the details screen, not during approval.
- Backend 693fe1a2c verifies finalized non-bridge X Layer sends/swaps before exempting them from wallet reservation locks. Pending and bridge operations retain their protections. Read-only live proof found 21 legacy operations finalized; no payment records were rewritten.

## Verification
- Backend aggregate read returned all six rows fresh, valid schema, matching linked-wallet revisions in 519ms. Circle-first reads and RPC fallback probes agreed. Health HTTP 200 after restart.
- Browser tests passed: reconnect and automatic retry, stale amounts excluded from spendable balance, StrictMode coalescing; selector holdings and fixed-network token switching; native/EURC retry coalescing; three mobile widths in two themes; fixed-token Arc layout; Earn limits, Max, review and terminal states; earned-interest reconnect, account isolation and stale-response cancellation.
- Cache regression and scoped TypeScript checks passed.
- The older full-home refresh fixture cannot bundle its current dependencies (Node crypto/stream imports); the focused real-hook browser recovery suite covers this change instead.
- Pixel before final recovery APK: Base sheet showed ETH 0.00000809497, USDC 1.11, USDT 0.00, EURC 0.00. Arc sheet showed USDC 0.65 and EURC 0.61. Base swap total displayed approximately $1.13. Base/Arbitrum token reversal preserved both networks; unsupported ETH/Solana reversal was disabled.

Final APK and post-install device results are recorded in the native release manifest and follow-up below. No funded swap, bridge, approval, deposit or withdrawal was submitted by the agent.

## Final installed artifact
- Native APK: `C:/Users/USER/pocket-play-update-20261101/native-release/pocket-balance-recovery-20261105.apk`
- SHA-256: `CDFE99E01074BD5FECE29E181F9B1E7AD7C470874DFB47795AA0A5AA2EC1EF21`
- All 1,868 dist files match packaged assets. ADB install -r reported Success; app data was preserved.
- Reviewed native source/test snapshot: `native-release/balance-recovery-source-20261105.zip` (21 files).
- Final recovery APK device interaction checks paused because the phone is actively being used in another application; availability requested. Earlier token-switch APK device checks above remain distinct from post-install validation of the final APK.

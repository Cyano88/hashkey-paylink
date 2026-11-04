# Cross-bridge flow audit — 4 November 2026

Scope: private-owner native cross-asset bridge, existing bridge/swap lifecycle, server execution and recovery. Arc and public rollout remain outside scope. No new funds moved during this audit.

## Corrected findings

| Finding | Correction | Verification |
|---|---|---|
| Old bridge screen mounted while capabilities loaded, including token callback changes | Owner-scoped loading/error/ready capability state; explicit disabled response required before legacy fallback; retry outages; guard old recovery restoration | Browser loading, callback churn, owner switch, error/retry regression; actual Pixel opens new selector |
| Clearing an in-flight quote could leave quoting/Max locked | Invalidate response and clear quoting on amount/route changes and cancellation | Browser delayed quote then amount deletion; Base/BSC/Solana flows |
| Success details did not receive the same row as Activity | Use canonical operation-to-Activity adapter, preserving actual output, fee, route, reference and hashes | Result lifecycle, receipt320/426px, scoped TypeScript |
| Cross USDC bridges were inferred as legacy CCTP in full Activity | Exclude modern operation/cross IDs and other asset identities; clear stale inferred adapter; completed legacy tracker renders nothing | Actual Pixel reproduced wrong USDC wording/duplicate raw hashes; new adapter and rendered-receipt regressions |
| Settlement refresh covered only standard wallet balances | Refresh existing shared data handlers at terminal transition; refresh BSC after submit | Scoped TypeScript, operation journal, existing managed recovery and panel tests |
| App exit could leave Circle operation hashless and permanently pending without wallet session | Provider data discovers candidate only; bind saved request/order/wallets and require canonical exact source proof before atomic journal update | Pending proof, mismatched identity, concurrent cancellation/identity mutation, worker integration regression |
| Oldest50 unresolved records could starve newer work | Rotate worker batches |51-record failure-isolation regression |

## Deployment and checks

Backend commit21e2e2ab5391fb88259c301b5eaa29ad87b782b0, Render dep-dbll4h0ae00c73c7gdd0 LIVE; SSH HEAD matches; /api/health healthy database and zero unresolved/stale operations.

16 original backend cross suites plus new recovery audit suite passed. Coverage includes quote/wallet binding, fee reimbursement, source execution, signed Solana identity, duplicate dispatch prevention, finality, delivery, refunds, terminal ledger and recovery. Exchange notifications, transfer classification and full money push worker passed. Native panel, capabilities, Activity grouping, operation journal, managed recovery, result lifecycle, receipt layout, scoped typechecking and source guard passed.

Final native APK: native-release/pocket-bridge-parity-pixel-20261104.apk, SHA256805675585437D9D5BB1E16948968CE20638A51DF21038995767AD322D2FF4FB0. Matching installed test certificate;1866 bundled assets verified against dist; install-r retained data. Version remains1.0.15/code16; not a Play Store release. Frontend changes remain in the separate non-Git native lineage; narrow source snapshots preserved in output/bridge-audit-20261104/source.

Pixel read-only quote:0.1 Base USDC ->0.077092 Arbitrum USDT, fee0.01142USDC, total0.11142USDC. Quote review closed before payment approval; not a payment result. Base balance0.208194USDC. Final actual Pixel parity PASS: compared fresh UI XML receipt content from Home Recent activity and full Activity; identical status, paid/received, route, fee, date, copy controls and Done. Visually inspected final screenshot; no legacy progress block, raw hashes or incorrect USDC delivery wording. Corrected receipt left open on device.

## Limits

Only the earlier0.2USDC Base->ArbitrumUSDT operation was live-funded. Other route coverage is fixtures, not live transfers. Missing-hash fallback requires terminal provider evidence plus finalized exact source proof; ambiguous unsigned/broadcast outcomes remain reserved instead of guessing failure or sending again. Public enablement and main web selector remain unchanged. Raw Pixel transition recording contains notification overlays and is private audit evidence, not shareable demo footage.


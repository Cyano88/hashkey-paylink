# Final bridge and swap consistency audit — 7 November 2026

Scope: Pocket bridge/swap presentation, balances, quotes, approvals, settlement, receipts, activity grouping, and fees. Native workspace: `C:\Users\USER\pocket-play-update-20261101`. Backend production commit remains `a7fdd125203e1c65b548647370f867053c0d9787`; this audit makes no backend change.

## Changes

- Arc swap no longer adds a duplicate Refresh balance prompt beside the quote. It retains the main available-balance display and last-known balance; unknown spending availability still blocks signing.
- Native swap retains an interrupted-wallet-approval explanation across background `awaiting_approval` polls. Retrying clears the explanation, reuses the saved challenge, and does not execute a second swap. Advancing/terminal status clears it normally.
- Updated browser assertions that still expected retired helper copy, automatic native-output selection, or a reopened pending sheet on clean reload. Stable-to-native tests now explicitly select both assets. Recovery is tested separately without automatic signing.
- USDC/USDT Activity and Recent icons remain unchanged pending the user's design decision. Recommendation: reuse the receipt's filled monochrome token assets at the existing list size.

## Verification

Backend: all 14 suites in `.codex-temp/final-exchange-audit/backend-results.json` passed: cross-bridge route coverage, reimbursement, recovery, Circle/Privy runtime, API, native/EURC routes, EVM RPC budget/API, sponsored Solana swaps, stable swaps, BSC, X Layer sponsorship, and native/stable reimbursement. This includes 26 reimbursement network/asset combinations and atomic fee settlement checks. Quote-validation RPC reads are distinct from display-balance fetching.

Native checks cover quote timing, retained balances, Max presets, selectors, layouts, receipts, outcome amounts, errors, Arc recovery, bridge progress, and swap recovery. Initial stale test failures remain recorded in `native-results.json`; corrected reruns are retained separately rather than overwriting that evidence. Bridge progress fixtures cover 56 directed network pairs. Arc lifecycle covers 10 scenarios including unknown spending balance without duplicate refresh UI or signing.

The native/stable swap route matrix passed for Ethereum, Base, Arbitrum, Polygon and Solana, both directions, at 426x952 and 320x640. Browser fixtures verify PIN expiry without sending, approval timeout and explicit retry without duplicate execution, ambiguous-response recovery, definite fee/expiry rejection, retained idle estimates, availability errors, and failed-result amounts. Logs: `.codex-temp/final-native-swap-matrix.log`, `final-native-swap-failures-complete.log`, and `final-native-swap-tail.log`.

Focused TypeScript and native source-lineage checks passed. Native source preservation: `native-release/final-exchange-audit-source-20261107.zip` (54 files). APK packaging and installation evidence is recorded separately in `native-release/final-exchange-audit-20261107.json`; that manifest is authoritative for the installed artifact and hash.

## Live observations and limits

Pixel screenshots show settled Base swap balances/total and Base USDC to Arbitrum USDT bridge balances, formatted amounts, muted USD values, and separate token/network switches. The inspected completed bridge receipt identifies both the source USDC and destination USDT correctly. Recent Activity shows bridge entries rather than the prior stray received entry. Prior settlement reconciliation evidence is in `2026-11-07-bridge-settlement-delay.md`.

No new payment was signed or broadcast during this audit. Fixture coverage is not proof of live execution of every route. A later quote-only Pixel attempt was stopped by the foreground guard because Pocket was no longer the active app; no blind taps were issued. Static screenshots do not establish that every animation is flicker-free.

Final Pixel update installed successfully without uninstalling or clearing data. The existing Pixel app uses the local Android Debug certificate; a release-signed update was correctly rejected, then the matching debug variant was built and installed. Final APK SHA-256: `464538BDBBE6883D2B2FB0CD8C1E5F8E3551AE653ACD269C45C5F056866D9134`; all 1,870 packaged web assets matched the built distribution. No public rollout occurred. The complete failure/recovery rerun exited successfully.

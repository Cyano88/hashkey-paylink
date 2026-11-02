# Bridge and swap audit - 2026-11-02

## Verified incident

Installed native screenshot `pocket-play-update-20261101/native-release/bridge-current.png` shows failed Arbitrum 6.40 USDT to USDC swap, action b817867a-9b9a-4598-afa0-1da15cc7c1e3. Wallet-scoped Circle records show two failures: first onchain (0xd8fe0da7a2293d8547d85369ecbedaeaba5ecfdf3a32a66035935feef0ae35f5), second estimation failure. Both report Min return not reached. Call trace confirms actual attempted output 6230923 versus minimum 6231551; the account-abstraction outer receipt status alone is not settlement evidence. Earlier 1.1 and 1.8 USDC bridge destination transactions are complete.

Live read-only comparison confirms disabling RFQ removes Wintermute ARB from the fresh quote. OKX v6 documents disableRFQ for time-sensitive quotes. This is route timing risk mitigation, not proof of the precise cause of the old price movement. Slippage remains 0.5 percent; minimum-output and calldata validation remain unchanged.

## Implemented changes (rollout verification below)

- Exclude time-sensitive RFQ for asynchronously approved EVM swap quotes, including conversion preceding X Layer bridges.
- Background CCTP worker accepts Polygon, Ethereum and Arc source networks, previously incorrectly excluded.
- Preserve failed swap and USDT bridge provider transaction hashes for receipts/recovery.
- Native bridge sheet retains review during refresh and provides a processing fallback if parent controls disappear; refreshing no longer closes/reopens the sheet.
- Native swap refresh retains the review instead of clearing it.

## Verification

API regression for failed transaction hash retention passes. Native EVM swap validation passes all 16 directions. USDT route validation passes. Reproduction worker fixture with Polygon now passes (previously failed). Native bridge browser regression covers removal of quote and parent action during approval, with no implicit submission. Existing review browser tests pass eight asset/route/viewport cases.

Initial 32 backend smoke files: 27 passed, 5 failed due stale module import, unavailable Relay fixtures, or unisolated durable dependencies. These are not proof of a passing full audit. Native browser runner must use `node --import tsx` and PLAYWRIGHT_MODULE; earlier plain-node module failures were harness failures.

## Additional verified fixes

- Home did not merge saved CCTP bridges before displaying recent activity. It now shares the bridge merge used by Activity, and groups token logs after all local recovery sources. A browser regression reproduces Polygon principal 1.8, debit 1.873549 and destination receipt; one bridge remains, while an unrelated send remains visible. Local provider bridge rows now preserve destination transaction hashes.
- Native swap busy/pending callbacks no longer emit false during every effect cleanup, avoiding transient parent state resets. Quote refresh preserves the mounted review.
- EVM CCTP persists an attempt before requesting the challenge; each new attempt uses a unique provider reference. Authenticated, wallet-scoped recovery only reads that reference and cannot create another challenge. Five-network integration regression passes.
- Solana CCTP persists the fully signed transaction signature before relay submission and rejects a response referencing a different transaction. Incomplete signatures are rejected in regression tests.
- USDT, X Layer and BNB inbound bridge recovery looks up a missing approval by the existing unique reference. Trusted wallet-scoped provider source failure terminates the record and retains its hash; uncertain source evidence remains unresolved.
- BNB inbound/outbound worker errors are surfaced rather than swallowed. All six CCTP sources are covered by a dedicated worker regression.
- CCTP status fetch has a 10-second timeout and rejects multiple messages rather than treating the first as authoritative delivery.

## Final local verification

- All 34 backend bridge/swap smoke scripts passed in the final run; results in .codex-temp/bridge-audit-results-final.json.
- Full web/backend TypeScript passed and production source build passed.
- Native browser fixtures passed: shared review across eight route/viewport cases, approval-control disappearance, draft lifecycle, quote timing, amount constraints, BNB bridge USDC/USDT both directions and cancellation, X Layer review/cancellation, USDT amount constraints and exact Max, five-chain recovery, six-chain cancellation matrix, and Home grouping.
- Original native source/artwork guard passed. Native full TypeScript still has pre-existing errors in other modules; none remain in changed audit source files. Prior optional bridge challenge ID errors are fixed. Do not report native full typecheck as clean.
- Stale fixtures repaired: removed assertions for a retired preview endpoint while retaining all 20 indicative quote-direction tests; restored missing Relay fixtures from the preserved native checkout without replacing existing tracked fixtures; isolated the Solana durable pause-state fixture without changing production guard behavior.
- No real transfer was signed or submitted during this audit.

## Limits

RFQ exclusion mitigates time-sensitive routes; it cannot guarantee every market quote executes. Minimum output protections remain intact. Earlier failed records are not silently rewritten. Recovery of a lost EVM challenge response applies to new uniquely referenced attempts; old ambiguous attempts remain subject to existing provider/support checks. A signed Solana reference saved before relay is not proof of broadcast or settlement. Uncertain outcomes stay tracked and are never automatically resubmitted. These checks are distinct from a funded end-to-end mainnet transfer.

## Rollout verification

- Backend code commit 418cbf5d465042e18974fd8aae0e2a82d0c21f70 pushed; Render deployment dep-dbk8frflk1mc73b606e0 is live. Read-only inspection of the running process verified that exact revision, RFQ exclusion in all four quote modules, and the new bridge recovery handler.
- Production /api/health reports healthy=true, database=true, unresolved=0 and stale=0 after rollout.
- Native 1.0.10/code11 Vite build passed with explicit exit 0; Capacitor sync and JDK21 assembleDebug passed. All 1,867 packaged assets match the built web assets. APK SHA256 F5A8A42B750D5145CFD4FEA25FD6C9D88A53CB72CFA0BEA1F7BE3C17C362E11C; signer unchanged: 9b2452d82db87452c51b36ea4bda0dc6d65918a193453f6c068438a39adcadde.
- Installed with adb install -r on Pixel 5A160DLCH006VM; package/version verified, data preserved. Live Activity and Home show two failed 6.40 USDT swaps and the 1.10/1.80 USDC bridges under Swap/Bridge labels. No new funds moved. This is a debug device update, not a Google Play release.
- Native source manifest and 39-file recovery archive: C:/Users/USER/pocket-play-update-20261101/native-release/bridge-swap-1.0.10.json and bridge-swap-source-1.0.10.zip. Original baseline is retained.
- Main pre-existing generated dist/ and Android changes remain outside the scoped commit.

## Checkout boundaries

Backend/web: C:/Users/USER/hashpaylink-checkout-release-20261102. Native: C:/Users/USER/pocket-play-update-20261101. Last shipped backend code 802058f16, native 1.0.9/code10. Preserve unrelated generated dist/android changes. Native source policy must be extended only for reviewed changes, preserving baseline and artwork.

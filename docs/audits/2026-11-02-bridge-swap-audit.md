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

## BNB send and near-balance bridge follow-up

- Reproduced the send comparison defect against the deployed jsonb store: stored quote field order differs from the sealed review. Raw JSON string equality rejected unchanged transfers. Client comparisons now ignore object-key order while requiring identical keys, types, array order and values. Regression fixtures reject changed recipient, principal, fee and additional fields before signing.
- Production history contained repeated cancelled 4 USDT send preparations. The 30-second quote lifetime, shortened by price/block observation timestamps and a 20-second UI refresh threshold, also left too little review time. BNB send reviews now last at most 120 seconds. Price/block freshness remains 30 seconds and exact-batch fee coverage is rechecked during both prepare and submit. No debit is silently increased. Expiry now has a distinct message.
- A subsequent recorded 0.9 USDC BNB bridge completed with 0.029618019037125983 USDC reimbursement. This supports a fee-inclusive shortfall for the reported 1 USDC / displayed 1.02 USDC case, but is not the original failed quote. Live Relay quoting succeeded; live sponsored simulation reproduced the provider's BEP20 insufficient-balance error. That known error is now mapped to a sanitized 422 instead of a generic bridge failure. Principal and fee-inclusive balance checks run before unaffordable simulation. The bridge fee loop checks the coverage floor against the reserved margin rather than repeatedly rebuilding the margin.
- Passed: new send-review and outbound-quote regressions; BNB send client/service/operations, runtime, bridge operations/provider, fee and payment-service smoke checks; actual send-page browser checks across three viewports and both themes; full web TypeScript. Web/native Vite logs report successful builds. Render's source build also succeeded. These checks did not sign or submit funds.
- Deployed source e4b57181dd371c4e04d0a62f1998acd6e177580f, Render dep-dbkbki8473hc73878pk0 live. Running revision verified by SSH. Health reports healthy/database true, unresolved/stale zero. Live read-only fee estimation retained 119565 ms of the new review window.
- Native 1.0.11/code12 installed with preserved data on the connected Pixel. Same signer; APK SHA256 AED7052B8C40F0CE4EAFFA8007864BE9EB8D85C3CB143D1DF3582AD2862914E7. Native lineage guard, Capacitor sync, JDK21 assembleDebug and comparison of all 1867 packaged assets passed. Recovery manifest/archive: native-release/bnb-review-1.0.11.json and bnb-review-source-1.0.11.zip in the native checkout. This is a debug device update, not a Play Store release. Foreground post-update review checks remain pending while the user's Encode meeting is active; no funded verification is claimed.
- Cross-asset discovery only: live read-only Relay quotes returned onchain v1 orders for Base ETH, Ethereum ETH, Arbitrum ETH, Polygon POL, Solana SOL, Arc USDC and BNB BNB to X Layer USDT, plus X Layer OKB to Base USDC. This samples all eight source networks, not all pairs/assets or execution coverage. Base ETH -> X Layer USDT permits a destination USDC refund; the future implementation must bind and display actual refund assets. Cross-asset routes are not enabled by this fix.

Backend/web: C:/Users/USER/hashpaylink-checkout-release-20261102. Native: C:/Users/USER/pocket-play-update-20261101. Prior deployed backend code e4b57181d, native 1.0.11/code12 before the follow-up below. Preserve unrelated generated dist/android changes. Native source policy must be extended only for reviewed changes, preserving baseline and artwork.


## Resume and USDG follow-up (2026-11-02)

- Native recovery now checks on foreground/focus, reconnect and visibility changes. Bridge and native-swap polling delays are cleared on resume while explicit server Retry-After limits remain enforced. Send and unsigned X Layer recovery gained missing visibility/resume listeners. Existing in-flight guards remain; minimizing never authorizes resubmission or marks a possibly submitted transaction cancelled.
- X Layer swap quote expiry and failed refresh retain the existing confirmation sheet. Busy callbacks no longer emit false during routine dependency changes. Swap confirmation/result and transaction details use Fee. Legacy stock-swap rows are included in the wallet activity filter.
- Root cause verified for USDG activity: backend pocketStockNoticeActivity omitted USDG/USDe from the ordinary swap classifier although native UI included them. Commit 41bbf3e5bf0c8a073e04414d637f413f6b6b2307 adds both and binds feeAsset to input currency. This restores input-side amounts and the standard wallet-swap presentation; underlying transfer deduplication is retained.
- Passed: 30 directed X Layer symbol-pair classification regressions; native X Layer receipt/proof and activity-deduplication checks; stock activity mapping; full backend/web TypeScript; native recovery schedule checks; five-network native swap recovery/browser checks (Ethereum, Base, Arbitrum, Polygon, Solana); quiet send/account-switch recovery; USDG expiry/failure/retry confirmation identity; stock quote-idle and actual receipt amount browser regressions. Older browser fixtures needed current mock exports and Refresh quote label; failures were corrected and rerun, not counted as passes.
- Native Vite, lineage guard, Capacitor sync and JDK21 assembleDebug passed. All 1867 APK assets match dist. Pocket 1.0.12/code13 installed on Pixel 5A160DLCH006VM with data retained. APK SHA256 2A09F16F5F12BF7B54068DB2021047A753910FFA1A39E73D8EDDA3DFB8AF38DD; unchanged signer 9b2452d82db87452c51b36ea4bda0dc6d65918a193453f6c068438a39adcadde. Source recovery: native-release/resume-1.0.12.json and 15-file resume-source-1.0.12.zip in the native checkout. Not a Play release.
- Backend deployment dep-dbkce5hsrm7s73a2js1g for 41bbf3e5b was verified live by SSH. No signing or funds sent by these checks.

### Remaining work and agreed bridge policy

- Cross-asset bridging is not enabled by these changes. The eight-network execution/settlement matrix remains to be implemented and verified, including native deposits and correct intermediate/refund assets. Existing same-asset route validators must not simply be weakened to expose unsupported execution paths.
- Policy clarified by the user: supported stablecoins can bridge to/from all supported networks, including Polygon and Solana. Native POL and native SOL cannot be bridge input or output assets. ETH on Base to USDC or USDT on Polygon/Solana is permitted where the destination token and provider route are actually supported. Arc currently has no supported USDT contract; this must not be invented to satisfy a network-wide label.
- Polling fixes do not prove every wallet SDK can finish while Android suspends the process. Server recovery without a client-supplied transaction hash and all signing/background interruption boundaries still require deeper verification. Never auto-cancel merely because the app is minimized; unknown dispatch remains pending until reconciled.

- Pixel live review check: USDC -> USDG initially showed a transient price-unavailable state, then obtained a valid quote with the standard Confirm swap sheet and Fee 0.01 USDC. Background/foreground retained the unsigned review (same dialog) and expiry exposed Continue without starting processing. Closed review and returned Home; no PIN, signature or transaction submitted. The transient quote failure is not declared resolved by the presentation changes.


### Final cache migration and verified release

- The first live check exposed a second issue: source identity changes left legacy stock-swap rows in durable/browser snapshots. Commit 9194446a80fe480034e1abadfd2ce220bc7a87e3 replaces only a legacy row with the same event ID, chain and transaction when canonical wallet-swap evidence exists. Late legacy responses cannot resurrect it; unrelated events remain distinct. Tests cover migration, saved duplicate repair, late old responses and different event/network/hash boundaries. Activity grouping regression and full TypeScript passed after this change.
- Final Render deployment dep-dbkcic142hec73f9oij0 is LIVE. Running revision 9194446a80fe480034e1abadfd2ce220bc7a87e3 verified over SSH. Health: healthy=true, database=true, unresolved=0, stale=0. The first deployment's real USDG transaction verification mapped four stored notices to exactly one wallet-swap row, input/fee asset USDG and amount 0.95.
- Final Pixel version 1.0.13/code14 supersedes 1.0.12 above. Vite, lineage guard, Capacitor, JDK21 APK build, unchanged signer and all 1867 packaged assets verified. SHA256 158DBC46B933FEB90405FBB94372A0EC7C68DDA4050F403FA6C08C857809F601. Source manifest/archive: native-release/resume-1.0.13.json and resume-source-1.0.13.zip (16 files). Previous release artifacts retained.
- An ordinary pull-to-refresh on the updated Pixel corrected the existing historical row to USDG / Swap / 0.95 USDG. Read-only cache inspection confirmed exactly one wallet-swap row for that transaction. No application storage reset, signing or funds movement. Evidence snapshots in native .playwright-cli/usdg-corrected-live.yml and resume-after-background.yml.
- Cross-asset bridging, transient quote-provider reliability and full signing/background cancellation boundaries remain OPEN as specified above. Do not claim this pass implements the all-network cross-asset execution matrix or completes the entire bridge audit.

## Cross-asset bridge draft and selector agreement (2026-11-02)

Status: local source/testing only. NOT mounted on PocketSwapPage, NOT deployed, NOT installed on Pixel. Installed release remains 1.0.13/code14; deployed backend remains 9194446a80fe480034e1abadfd2ce220bc7a87e3 as last verified above. No funds signed or submitted.

### Implemented foundation

- Backend/web catalog and selection helpers cover Ethereum, Base, Arbitrum, Polygon, Solana, Arc, BNB Chain and X Layer. Native SOL/POL (including wrapped aliases) are excluded as bridge tokens; Polygon/Solana stablecoins remain eligible. Arc has no invented USDT entry. Arc USDC uses the six-decimal ERC-20 route, BNB stablecoins use 18 decimals.
- Separate cross-asset Relay validator binds both currencies, decimals, networks, amounts, owner-supplied sender/recipient, order ID, refund plan and execution calldata. It reconstructs pinned deposits and exact approvals; it does not authenticate wallet ownership or execute transactions. Existing same-asset validators are unchanged.
- Relay depositNative/depositErc20 semantics checked against relayprotocol/relay-settlement contract blob 015bdcd735ed611e853c908489a38731843bfc39. Native deposit events alone are not sufficient source ownership proof: settlement must bind the actual call/value path, particularly for smart accounts.
- Fixture matrix validates 496 eligible distinct-network asset pairs and mutation rejection. This is not 496 live supported routes.
- Earlier read-only capture sampled 20 live provider requests: 16 valid quotes cover all eight source and destination networks; four returned NO_SWAP_ROUTES_FOUND (X Layer OKB -> Arbitrum USDT, X Layer USDe -> Solana USDC, Base EURC -> Arc USDC, Arc EURC -> Base USDC). Valid quotes include Base ETH -> USDC/USDT on Polygon and Solana. Captures replayed successfully against the validator. Local captures contain public wallet data and remain outside Git under .codex-temp.
- Provider no-route responses now have a distinct 422/route_unavailable classification; amount-too-low is also 422. Service failure and rate limiting remain distinct, with sanitized messages and bounded Retry-After. No automatic retry behavior is claimed before the controller exists.

### Native layout and shared confirmation

Native checkout only: C:/Users/USER/pocket-play-update-20261101. Do not copy its full components over the divergent backend/web checkout.

- User-approved layout preserves the existing From / reverse / To structure. Two network dropdowns sit above it; independent input/output token dropdowns replace the old Base/Arbitrum selectors inside the cards. The old global USDC header will be removed when this form is mounted by the new execution controller.
- PocketCrossBridgeForm now adapts PocketCrossBridgeFields into the real shared PocketBridgeForm confirmation lifecycle. Quotes are bound to both network/token pairs and the exact input amount; stale route/amount responses cannot open approval. Retained review scope includes the destination token.
- Paid with, received asset, Fee and Total retain their proper token identities. Small native amounts use significant precision. Keypad/presets use source token decimals and preserve exact string balances. There is one Fee row.
- Review/processing locks network and token selectors and the keypad. Cross-asset tracking must carry matching selectionKey, asset and destinationAsset; legacy tracking cannot silently represent a cross-asset transfer. Unknown received amounts are not inferred one-for-one from the input.
- Passed browser fixtures: layout at 360/390/430 widths in light/dark; shared cross-asset review cases spanning all eight networks; expiry/failed refresh/retry within the sheet; no implicit submission; processing/dismiss/reopen/remount; stale token/amount quote rejection; exact percentage/keypad precision for ETH, 18-decimal BNB USDT and 6-decimal Solana USDC. Existing stablecoin shared review and approval-gap suites passed across eight route/viewport cases. Native lineage/artwork guard passed.
- Provider/catalog targeted TypeScript passes. Full native TypeScript remains a separate failing check outside this draft; final log is native-release/cross-bridge-draft-typecheck.log. Do not report the whole native checkout type-clean.

### Required next implementation

1. Authenticated source/destination wallet binding, fee estimation in source denomination, gas reimbursement and affordable balance checks for Circle smart accounts, Privy BNB/X Layer and Solana.
2. Sealed reviewed quotes; durable prepare/submit-once and recovery with the existing PIN/approval system; no automatic cancellation or resubmission on backgrounding.
3. Canonical source and destination/refund proofs for independent assets and native value, including smart-account call attribution; actual receipt amounts and Bridge activity classification.
4. Connect the new form to that controller, build/install on Pixel, verify real screens and interruption boundaries. No mock data or incomplete execution is to be installed as a usable bridge.
- Native draft recovery archive: native-release/cross-bridge-draft-20261102-192225.zip with matching JSON manifest (nine source/test/policy files). SHA256 F6BC869C3D3523A2EAAE288C474C31489065EC220C90482C9ABDBDCFC011B109; every archived entry rehashed against source. This is an uninstalled draft snapshot, not an APK/release. It layers on the preserved 1.0.13 native lineage.

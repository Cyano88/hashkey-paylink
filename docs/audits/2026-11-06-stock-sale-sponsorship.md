# Stock sale sponsorship extension — 2026-11-06

Stock -> USDC sales now use the same Privy atomic sponsored batch as supported purchases. The batch resets allowance, approves the exact stock amount, executes the approved router call, clears allowance and pays the exact USDC reimbursement to treasury. No stock-token reimbursement or native OKB debit is introduced.

The signed fee binding marks output-funded reimbursement and binds the gross minimum USDC proceeds. Its totalUnits is the minimum USDC received after reimbursement. Quotes reject nonpositive net minimum proceeds. Existing input-funded transfer, merchant, bridge and purchase arithmetic is unchanged. Fee repricing, owner/wallet/intent binding, authorization validation, billing coverage and durable idempotency remain enforced.

Settlement verifies the successful operation, exact stock debit, USDC reimbursement and actual net USDC credit against the approved net minimum. Activity notices carry an explicit fee asset, preserving legacy input-fee fallback. The native review shows net expected/minimum proceeds and USDC network fee; the receipt reads the actual net output transfers.

Scope: supported catalogue stock -> USDC only. Existing 0.25% purchase platform-fee policy remains unchanged; this change adds network reimbursement on sales, not a new sale platform fee.

Validation: expanded sponsored-swap fixtures cover sales, insufficient proceeds, wrong reimbursement token/total, owner/wallet isolation, altered calls, failed operations, missing output, exact fee effects, native/stable purchase regressions and single-broadcast retry behavior. General reimbursement/merchant-split fixtures, focused backend/native TypeScript and native source guard passed. Browser tests verify net sale review, USDC fee, no OKB fee, actual net received receipt and existing single-sheet completion. No real sale submitted by automation.

Backend commit 089aebcbd9a5e40716c483c6fea758947ad7aa50; Render deploy dep-dbms3o3rjlhs73cbg1qg requested. Device/live quote verification pending below.
- Matching Pixel APK installed: native-release/pocket-stock-sale-sponsor-20261106.apk, SHA256 90D4B0446348765323979579A15467BBEE5C7498335D20DCF73EAA6638BE50D3; all 1869 packaged assets matched dist. Delta source archive preserves relative paths: stock-sale-sponsor-source-20261106.zip. Existing zero-OKB sponsorship preparation regression also passed. Device live quote check awaits Pocket returning to the foreground.
- Render deployment confirmed live at 2026-11-06T12:08:05.811891Z; health returned HTTP 200. No live sale quote or sale execution claimed: Pocket was not foreground during the final device checks.

## Estimate error and latency follow-up

Pixel Apple sell screen showed generic Price temporarily unavailable. Render log at 2026-11-06T12:12:11.565Z identified billing_coverage as the failing stage. Read-only durable checks found no persisted billing halt. The precise underlying billing-provider failure was not captured by the prior generic log; no provider root cause is claimed.

Removed the full historical billing audit from quote-only requests. Quote preparation still checks the persisted billing halt, configured sponsorship eligibility, exact route, amount, fee estimate and signed binding. Full fresh billing proof remains mandatory in the submission handler; fixtures explicitly reject unavailable billing before reservation/broadcast. This change does not clear a halt or bypass submission accounting.

Start reimbursement simulation at the configured fee floor, removing the redundant one-unit pass for floor-priced operations. Below-fee sales fail before simulation with an actionable 422. Native amount debounce reduced from 650 to 300 ms; superseded amount requests abort, and fetch timeout is bounded to 20 seconds. Below-fee input does not offer a futile Refresh quote action. Safe stage-duration logs contain no credentials or request payloads.

Reimbursement/merchant regressions, stock-sale/purchase sponsorship including billing rejection, native typecheck, detail cancellation regression and buy/sell net receipt tests passed. Backend c5bc1119c9d6d53cf368e3e49b83637ce29b3a11 deploy dep-dbmsc66i0phs73cnd5n0 requested; actual live timings pending.
- Estimate-speed APK installed with SHA256 05A88A2AEE9F5BBD2A3E51E4C93F8284659D42EE19C67F4C158E95B7AE1297EB; all 1869 assets verified. Source archive stock-estimate-speed-source-20261106.zip. Render marked dep-dbmsc66i0phs73cnd5n0 live at 2026-11-06T12:25:46.476038Z. Live quote latency remains unmeasured because Pocket was not foreground; user was asked to reopen it. No sale submitted.

## Stock feedback alignment audit

Observed Pixel Apple sale review still rendered a red raw `Payment approval expired. Review the transfer again.` paragraph. Active stock buy/sell entry and review, stock send/wallet actions, notifications and the shared incoming-request sheet now use PocketActionFeedback, matching the bridge/swap muted style and sanitization. A review error appears once beside its action; background notification errors do not duplicate an open request sheet. Expired approval wording is neutral and action-oriented. Retry uses Continue. Stock price/P&L loss colours remain unchanged.

Investment review uses the same 20-second pre-review quote freshness window as swap. This does not extend a signature, auto-submit, or bypass an uncertain transaction. Last available stock amount remains displayed during stale balance refresh, while freshness requirements still block execution. Existing chart, holdings and Activity empty/error states were inspected; chart error text is already muted and Activity uses the shared panel. Unreferenced legacy StockBalanceCard is not an active stock route.

Buy and sell browser regression deliberately expires an approval, checks exactly one muted status message with sanitized wording, then retries through actual receipt-derived net output and one success sheet. Shared exchange message tests, detail routing/presets/quote-cancellation regressions, focused typecheck and source guard passed. Live backend quote timings observed: 3101 ms at 12:30:18 UTC and 4056 ms at 12:30:52 UTC. These are server timings, not whole-device tap-to-render measurements.
- Final muted-feedback APK installed successfully on Pixel 5A160DLCH006VM: pocket-stock-muted-feedback-20261106.apk, SHA256 B9E4EEB2113916E186A6489FD299EDF32429F7FA0B807E1D07DE5BF7D848869A. All 1870 packaged assets matched the final dist. Source preserved in stock-muted-feedback-source-20261106.zip. Expired-approval behavior verified by browser regression; no live trade or forced live approval failure was submitted. No public rollout performed.

## Chart and return continuity

Pixel inspection showed the stock listing and Apple detail chart. The chart hook previously retained history only in memory. It now restores a bounded, validated cache of public chart data (12 histories, at most 24 hours old at restoration), renders it during refresh, and starts the 1D request on row press/focus. Requests remain deduplicated; histories stay isolated by asset and period. No trade quote is fetched for chart navigation.

Personal P&L was gated off whenever wallet/prices became stale. It now uses the same retained display balances/prices as investment value, while retaining strict cost-basis and exact holding-quantity checks. Basis evidence is cached in memory by authenticated user and wallet; authoritative empty evidence clears it. P&L slots reserve their height; overview P&L is placed beneath investment value. No last-known label is introduced.

Browser regression passes persisted-history reload without a repeated fresh request, P&L during stale price refresh, range isolation, responsive layout, and trade regressions. Basis regression passes failed-refresh retention and account/authoritative-empty isolation. Focused typecheck passed. The live price endpoint explicitly returns change:null, so no 24-hour percentage has been invented or wired into listings. Recommendation: market change belongs with market price, personal return with investment value.
- Installed Pixel APK pocket-stock-chart-continuity-20261106.apk, SHA256 41622AB5152DB84825074101F63EFFE7C1E2602AE64DFD05BF41F40D05502764; all 1870 packaged assets match dist. Source archive stock-chart-continuity-source-20261106.zip. Browser verification covers restart reuse and stale-display return retention; first-ever uncached history still requires a network response. No live trade or public rollout.

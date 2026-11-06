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

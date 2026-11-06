# Stock sale sponsorship extension — 2026-11-06

Stock -> USDC sales now use the same Privy atomic sponsored batch as supported purchases. The batch resets allowance, approves the exact stock amount, executes the approved router call, clears allowance and pays the exact USDC reimbursement to treasury. No stock-token reimbursement or native OKB debit is introduced.

The signed fee binding marks output-funded reimbursement and binds the gross minimum USDC proceeds. Its totalUnits is the minimum USDC received after reimbursement. Quotes reject nonpositive net minimum proceeds. Existing input-funded transfer, merchant, bridge and purchase arithmetic is unchanged. Fee repricing, owner/wallet/intent binding, authorization validation, billing coverage and durable idempotency remain enforced.

Settlement verifies the successful operation, exact stock debit, USDC reimbursement and actual net USDC credit against the approved net minimum. Activity notices carry an explicit fee asset, preserving legacy input-fee fallback. The native review shows net expected/minimum proceeds and USDC network fee; the receipt reads the actual net output transfers.

Scope: supported catalogue stock -> USDC only. Existing 0.25% purchase platform-fee policy remains unchanged; this change adds network reimbursement on sales, not a new sale platform fee.

Validation: expanded sponsored-swap fixtures cover sales, insufficient proceeds, wrong reimbursement token/total, owner/wallet isolation, altered calls, failed operations, missing output, exact fee effects, native/stable purchase regressions and single-broadcast retry behavior. General reimbursement/merchant-split fixtures, focused backend/native TypeScript and native source guard passed. Browser tests verify net sale review, USDC fee, no OKB fee, actual net received receipt and existing single-sheet completion. No real sale submitted by automation.

Backend commit 089aebcbd9a5e40716c483c6fea758947ad7aa50; Render deploy dep-dbms3o3rjlhs73cbg1qg requested. Device/live quote verification pending below.
- Matching Pixel APK installed: native-release/pocket-stock-sale-sponsor-20261106.apk, SHA256 90D4B0446348765323979579A15467BBEE5C7498335D20DCF73EAA6638BE50D3; all 1869 packaged assets matched dist. Delta source archive preserves relative paths: stock-sale-sponsor-source-20261106.zip. Existing zero-OKB sponsorship preparation regression also passed. Device live quote check awaits Pocket returning to the foreground.
- Render deployment confirmed live at 2026-11-06T12:08:05.811891Z; health returned HTTP 200. No live sale quote or sale execution claimed: Pocket was not foreground during the final device checks.

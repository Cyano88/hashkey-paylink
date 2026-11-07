# Earn audit - 2026-11-07

## Verified scope

Native source: C:/Users/USER/pocket-play-update-20261101. Backend: hashpaylink-recovery-release-20261104. Render deploy dep-dbmvhk3m8hqs73bhogvg is live at 1e28e0f77b22f15f99fff03562e4d40e31b54a47; compared Earn sponsorship files against that commit with no diff. No live deposit or withdrawal submitted.

## Findings

1. **Reimbursement missing on deposits and withdrawals (open).** Native usePocketEarnExecution sends purpose=earn through sendSponsoredTransfer, without a fee quote or reimbursement batch. Backend xlayer-sponsorship.ts explicitly excludes Earn from the stablecoin reimbursement requirement and rejects purpose=earn in its reimbursement quote branch. earn-sponsorship.ts validates an individual approval/supply/withdrawal call. UI says Covered by Pocket, accurately describing the current subsidy, but not the newer reimbursement policy.
   Required implementation: owner/action/asset/amount-bound signed fee quote, exact approved atomic calls, deposit balance including fee, withdrawal fee from output with net receipt, policy/billing verification, idempotent recovery, and matching batch proof. Current pocketEarnProof supports single-call mode only. Do not enable batched execution without upgrading proof/activity reconciliation. No new fees introduced by this UI pass.
2. **Two terminal dialogs (fixed locally in this pass).** Reproduced browser dialog count=2 for deposit/withdraw, both confirmed/failed. Result now replaces entry sheet; updated browser test requires count=1.
3. **Earned amount disappears after refresh failure/syncing (fixed for mounted refresh).** usePocketEarnEarnings replaced ready values with unavailable or syncing. Now retains the verified value within the same owner/wallet/asset scope. Initial unknown remains unknown, account switches clear the display, authoritative ready zero still replaces values. Cross-remount persistence is not added by this pass.
4. **Amount keypad inconsistent (fixed).** Moved Max into the shared 25/50/75/Max keypad. Integer units prevent rounding above balance. Browser checks 25 percent of 0.040035 USDC = 0.010008, and Max preserves exact 0.040035. No fee-aware Max yet because reimbursement is not implemented.
5. **Redundant headline (fixed).** Removed Put your stablecoins to work on owner request. Earn header leads directly into asset/APY rows.
6. **Avoidable wait points (open).** begin and review each read a full on-chain position; execute repeats position and allowance reads, then separate approval and deposit submissions. These checks must be consolidated into the quoted execution flow rather than simply removed. Existing approval_ready recovery is deliberate and must remain recoverable.
7. **Display inconsistencies (open).** Amount/detail screens do not consistently show muted USD/local equivalents. Shared confirmation parser recognizes USDC/USDT, not USDT0. Disabled actions while a cached position is stale are not visually explained. Earned-so-far first-sync polling has no visible timeout for a persistently syncing response. APY persists during in-page refresh but page remount starts a new read.

## Balance-source audit

Earn sheet display uses usePocketXLayerStablecoins -> usePocketStockBalances -> /api/pocket/xstocks/balances with provider=okx. Backend maps indexed aToken balances to earn.usdc/usdt, with RPC fallback. Provider decimals for unknown tokens can also use RPC. Thus display is indexed-first, not zero-RPC. Action preflight still uses direct public X Layer position reads; stockClient is also used for transaction verification. This pass does not alter balance providers.

## Verification

Passed existing browser Earn UI, sheet, execution, earnings hook, shared yield display, APY continuity, backend sponsorship, exact calls, interest accounting and interest-reader suites. Backend fixtures cover both supported assets and all three actions; reject tampered recipients/calldata and duplicate broadcasts. They prove the existing sponsored behavior, not reimbursement parity.

Pixel inspected read-only: Earn list loaded 3.99 percent USDC / 3.09 percent USDT0 at capture time, then USDC details with shared balance values and earned-amount shimmer. Rates are observations, not fixed claims. Screenshots: output/bridge-swap-audit-20261105/balance-earn-list.png and balance-earn-usdc-details.png. Browser captures cover light/dark and small viewports. No production configuration or backend code changed.

## Installed UI verification

Native APK pocket-earn-ui-audit-20261107.apk installed successfully on Pixel 5A160DLCH006VM. SHA256 345549DE58C4A4CB8964FC4AD5E7A9F9A750423EC9E487FFC2B4E2F5DE662420; all 1870 packaged assets match dist. Source archive earn-ui-audit-source-20261107.zip contains this pass plus prior native fixes. Focused Earn typecheck, source guard and Android release build passed.

Post-install Pixel screenshot balance-earn-final-list.png confirms the headline is removed and assets start directly beneath the Earn header. Initial rates use the existing shimmer. Updated browser assertions verify one terminal dialog for both actions/statuses, exact percentage/Max amounts, and retained zero earnings during failure/syncing. Reimbursement and other open findings above remain unimplemented; no backend deployment or live transaction occurred.

# Cash backend rollout

Cash represents Base USDC. This backend release adds fixed Base USDT-to-USDC
conversion and retains verified net delivery for linked USDT bridges. It does
not change the installed client or introduce a separate balance ledger.

## Gates

- `POCKET_CASH_CONVERSION_ENABLED` defaults off. Base RPC is also required.
- `POCKET_CASH_MULTICHAIN_ENABLED` defaults off and requires the conversion gate.
- Disabling the gates stops new quotes/execution while preserving status recovery.
- Client Cash UI has a separate rollout and must not precede backend acceptance.

## Acceptance

Run the Cash conversion proof, API, linked-route and USDT recovery smoke scripts
with `node --import tsx`, and the scoped `tsconfig.cash-release.json` typecheck.
Provider fixtures do not establish live Circle fee estimation or Pixel acceptance.

Before enabling funding, verify the authenticated availability response, a fresh
OKX route, exact Circle batch fee estimation, and the installed client flow.
Reconcile actual received USDC and reimbursement before declaring completion.

## Recovery

The journal binds owner, wallet, quote and optional source bridge. An unfinished
conversion blocks another wallet conversion. A completed source bridge cannot
fund another successful conversion. A proven failed conversion may retry without
repeating the bridge. Missing historical delivery proof is not replaced by a quote.

Rollback should disable new funding through the gates while retaining this code
until every submitted operation has reconciled. Removing the endpoint with live
pending conversions would remove their recovery path.

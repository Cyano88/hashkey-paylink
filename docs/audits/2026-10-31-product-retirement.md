# Non-trade product retirement - 2026-10-31

Owner direction: remove Hash PayStream promotion and non-trade offerings; retain Trade; retain future Hash PayLink Escrow source under development without public general-escrow endpoints. Archive old code in `hash paystream roll downs`.

## Hash PayLink

Embedded module moved from `modules/streampay` to `hash paystream roll downs/streampay`, preserving directory depth, receipt identifiers and historical recovery implementations. Active browser imports and legacy HTTP registrations are removed. General Arc agreement public routes and all four generic escrow workers are disconnected. The early retirement boundary returns 410 on all methods before retired handlers. Shared X Layer handler permits Trade records only. Current Pocket, checkout, receipts and Trade routes remain separate. Historic records and on-chain contracts are not deleted or claimed disabled.

Public promotion removed. Developer payment products show Escrow service / Coming soon / Under development. The legacy general agreement checkout becomes an unavailable notice, without funding actions. The retained platform project is presented as Trade without changing its persisted ID. General escrow snippets and admin agreement operations are unavailable.

Validation: production source build passed; backend module graph bundled; retirement HTTP boundary, Arc hosted Trade, X Layer hosted Trade, operations workspace/cases/audit, checkpoint recovery and historic creator receipt/function-preservation checks passed. TypeScript reports 27 existing diagnostics versus the earlier 43, with no new normalized diagnostics.

## Standalone preparation

Live service srv-d9opfcad0e5s73c3omag runs commit c8f58363733edf0f51c67a94c81853fd59dff7f9, matching the inspected checkout. Its Trade-only UI/server replacement and archive are prepared locally. 140 unreachable source files were moved with SHA-256 preservation checks. Authenticated Trade, wallet linking, accepted terms, messages and its checkout dependencies remain. Non-trade web handlers and worker startup are absent from the replacement server. Typecheck and build passed. Deployment versus full suspension awaits the owner's Trade availability choice. The separate Trade pilot and receipt staging cron services are already suspended.

## Reconciliation evidence and outstanding work

Read-only live Postgres inventory found no current general Arc mainnet agreement records and no queued operator actions in the inspected main store. Standalone historical transfers: two recorded successful transfers on chain 5042002 (testnet); two upfront assessment records marked completed. Assessment completion is not a settlement proof.

Fresh X Layer observations for all eight stored stock Trade records at blocks 74657283-74657313 found states 6/7/8/9 or a never-created escrow. The formerly disputed record now has state 8. Share-based records reported zero current underlying balances. These observations did not sign or broadcast transactions. The attempt to persist reconciliation through the existing configured Trade project key received HTTP 403 ('An xStocks Agreement project key is required.'); the records were not modified and this access issue remains open.

Sampled configured retirement signer/contract addresses had zero native balances on Arc and X Layer. This is not an exhaustive token or liability inventory. No assets have been swept. Destination Pocket account confirmation, ownership checks, token balances and any remaining non-trade contract obligations are still required before transfers. No private keys or credentials are included in this report.

Unrelated local billing changes and generated dist are excluded from the release.

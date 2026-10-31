# Non-trade product retirement - 2026-10-31

Owner direction: remove Hash PayStream promotion and non-trade offerings; retain Trade; retain future Hash PayLink Escrow source under development without public general-escrow endpoints. Archive old code in `hash paystream roll downs`.

## Hash PayLink

Embedded module moved from `modules/streampay` to `hash paystream roll downs/streampay`, preserving directory depth, receipt identifiers and historical recovery implementations. Active browser imports and legacy HTTP registrations are removed. General Arc agreement public routes and all four generic escrow workers are disconnected. The early retirement boundary returns 410 on all methods before retired handlers. Shared X Layer handler permits Trade records only. Current Pocket, checkout, receipts and Trade routes remain separate. Historic records and on-chain contracts are not deleted or claimed disabled.

Public promotion removed. Developer payment products show Escrow service / Coming soon / Under development. The legacy general agreement checkout becomes an unavailable notice, without funding actions. The retained platform project is presented as Trade without changing its persisted ID. General escrow snippets and admin agreement operations are unavailable.

Validation: production source build passed; backend module graph bundled; retirement HTTP boundary, Arc hosted Trade, X Layer hosted Trade, operations workspace/cases/audit, checkpoint recovery and historic creator receipt/function-preservation checks passed. TypeScript reports 27 existing diagnostics versus the earlier 43, with no new normalized diagnostics.

## Live deployment

Hash PayLink commit 6f4319d0def5608a32fe7a6f6d9bbc457aff5913 went live via dep-dbio9a4s728c73fs3ob0 at 06:08:13 UTC. Live health returned 200; sampled general agreement and retired stream/checkpoint routes returned 410 for GET/POST. Retained Trade routes still required authentication. Owner admin Playwright verification showed Trade presentation and no general agreement operations navigation. A prior deployment triggered with symbolic HEAD resolved to the configured branch's older commit; it was cancelled during build before live. The verified release used the exact commit hash.

Standalone commit 1f78d1c9c4a317605545f004e7f0e2fb0e7a8bdd went live via dep-dbiocpgae00c73c8gj50 at 06:14:42 UTC. 140 unreachable source files were archived with SHA-256 preservation checks. The explicit direction to retain Trade governs availability: the shared service remains running with only Trade and its authenticated dependencies. Separate pilot and staging receipt cron services remain suspended. Live health/readiness and Trade catalogue returned 200; sampled retired GET/POST routes returned 410. Typecheck, production build, isolated PostgreSQL backend/community/hosted harness and local HTTP boundary tests passed.

Signed-in Playwright verification exposed expired scoped project keys (October 24-25) affecting hosted wallet access and checkout reconciliation. The active project is not suspended, but readiness 200 does not prove these upstream credentials work. No access checks were bypassed and no grants were renewed. Cached legacy project naming on the wallet access screen was corrected in follow-up commit 0212c5b689a502963844e819ec3adf4ad6a3ddae, with typecheck and build passed.

## Reconciliation evidence and outstanding work

Read-only live Postgres inventory found no current general Arc mainnet agreement records and no queued operator actions in the inspected main store. Standalone historical transfers: two recorded successful transfers on chain 5042002 (testnet); two upfront assessment records marked completed. Assessment completion is not a settlement proof.

Fresh X Layer observations for all eight stored stock Trade records at blocks 74657283-74657313 found states 6/7/8/9 or a never-created escrow. The formerly disputed record now has state 8. Share-based records reported zero current underlying balances. These observations did not sign or broadcast transactions. The attempt to persist reconciliation through the existing configured Trade project key received HTTP 403 ('An xStocks Agreement project key is required.'); the records were not modified and this access issue remains open.

Sampled configured retirement signer/contract addresses had zero native balances on Arc and X Layer. This is not an exhaustive token or liability inventory. No assets have been swept. Destination Pocket account confirmation, ownership checks, token balances and any remaining non-trade contract obligations are still required before transfers. No private keys or credentials are included in this report.

Unrelated local billing changes and generated dist are excluded from the release.

Additional read-only token inventory: 14 unique configured addresses had zero X Layer USDC and USDT balances (28 successful balanceOf calls). Native checks on Arc and X Layer were also zero. This only covers these addresses and assets, not every historical contract, stock asset or other chain. The eight Trade chain observations remain separate from persisted reconciliation, which is blocked by expired keys.

Render rollback protection: both production services had automatic deployment enabled on older configured branches (standalone main; Hash PayLink release/pocket-solana-usdt-20261012). Automatic deployment was set to off and confirmed by a fresh service read. Future releases must use the reviewed exact commit; do not re-enable an older branch before reconciling it with this retirement. This does not suspend either web service.

Final release confirmation: standalone 731397faedef1c786df94e2b5e4687e3fc54cebf / dep-dbioigfb9u1s73c3dvmg live at 06:27:02 UTC; Hash PayLink bb168857d295d2b7a63d604fa8b4c74897fa845e / dep-dbioihnb9u1s73c3e490 live at 06:28:31 UTC. Playwright confirmed the signed-in wallet screen says Trade. The obsolete public PDF and OpenAPI URLs now return the SPA HTML fallback, not the retired documents; the public pitch returned 200 with new Escrow wording and no old brand. Repeated live Trade catalogue/health checks returned 200 and retired GET/POST routes returned 410. Expired credentials, complete asset reconciliation and destination confirmation remain open; no funds moved.

Destination follow-up: the owner confirmed the complete Pocket email. The matching Pocket profile was verified against the live Privy user; Circle GET wallet reads independently confirmed the associated Arc and Base wallets are LIVE SCA wallets. Historical Arc testnet links were excluded from mainnet destinations. Personal identifiers are kept out of this audit. Expanded read-only checks covered 16 configured addresses and 32 X Layer USDC/USDT balanceOf calls, all zero; additional legacy creator/shared-relayer native balances on Arc/X Layer were zero. Shared operational credentials are not classified as sweepable retirement funds. No asset transfer occurred. Complete historical liability reconciliation and expired Trade key renewal remain outstanding.

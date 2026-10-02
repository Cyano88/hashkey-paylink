# Hash PayLink operations: audit and first rebuild

## Scope and ownership

The admin desktop stays with Hash PayLink. Operations are selected by product workspace, then section. Hash PayStream owns its customer support; Hash PayLink receives escalated payment and escrow cases. Pocket retains a direct support inbox. Third-party workspaces use the same isolation rules as Hash PayStream.

This first implementation is local and has not been deployed. No production environment variables, developer projects, API keys, agreements or financial records were changed. Existing unrelated documentation changes in this checkout were preserved.

## Findings and changes

| Finding | First-pass resolution |
| --- | --- |
| Developer Projects, Arc operations, Trade review, Pocket reconciliation and Pocket staff shared a broad admin allowlist. | Production entry points now use verified email access for the exact workspace and section. The new configuration has no production fallback to the old allowlist or user-ID grants. |
| Operations were presented as global, unrelated navigation tabs. | A desktop product selector and sidebar keep supported sections under one product. Hash PayLink typography, buttons, light/dark styling, sign-in and existing operation panels are retained. |
| Arc records were loaded globally and could be mixed across integrations. | Reads are requested per project, scoped again before returning data or doing chain reads, and counts are scoped. Release/cancel requests and approvals enforce the stored project boundary. |
| Trade reviewer lookup accepted a global agreement reference. | The stored record must have a valid project owner belonging to the selected workspace before planner, signature or mutation work. Unknown ownership fails closed. |
| “Transactions” was actually Pocket's unresolved payment reconciliation queue. | It is exposed under Pocket only. No external-product transaction dashboard is claimed. |
| Arc approval and global activation availability looked like the same status. | Activation settings live under Arc Agreements, behind an expandable settings panel. Project approval and global switch state are shown separately; no runtime switch is changed. |
| The UI's active-live-key check could accept a test prefix. | The UI now follows the server's environment fallback rule and excludes test credentials. |
| External support inbox ownership was ambiguous. | External workspaces show an honest “Escalation connection not configured” page to the founder. They do not read Pocket support storage or claim access to another product's customer inbox. |

## Access and workspace configuration

`OPERATIONS_FOUNDER_EMAILS` must contain the verified founder email supplied by the owner before rollout. An empty value denies operations access. `OPERATIONS_GRANTS_JSON=[]` means no additional team access. This rebuild does not change the live legacy allowlist by itself.

`OPERATIONS_WORKSPACES_JSON` explicitly groups verified developer project IDs:

```json
[{"id":"external-product","name":"External product","projectIds":["dev_example123456"]}]
```

Do not use that example ID in production. Never infer grouping from names, owner emails or website URLs. A project cannot appear in two groups. Pocket is reserved. Unmapped projects remain separate workspaces so they are not lost or silently merged. Navigation is limited to enabled project capabilities and the operator's grants.

Example future section grant (no team grant is configured by this change):

```json
[{"email":"reviewer@example.com","workspaceId":"external-product","sections":["trade-disputes"]}]
```

External sections are `projects`, `agreements` and `trade-disputes`. Pocket sections are `support` and `transactions`. Each grant permits the existing operations within that section; granular read-only/action-level roles and a founder access-management UI are not implemented in this pass. Multisig ownership and independent Arc approval remain separate checks; section access never replaces them.

Old Pocket admin links redirect to the Pocket workspace. Old global project/agreement/dispute links return to product selection, because selecting a product silently could target the wrong integration.

## Validation

- `scripts/operations-workspace-smoke.mjs`: founder configuration, malformed/duplicate mappings, section grants, unauthorized accounts, per-project counts, foreign and ownerless Trade references, and foreign Arc release/approval attempts. Denial occurs before chain access or mutation.
- `scripts/developer-projects-adapter-smoke.mjs`: existing owner/project behavior plus scoped admin listing, cross-project suspension denial and cross-section pilot-policy denial.
- Existing Arc operations, Trade reviewer and Pocket transaction suites pass. Trade still requires two distinct authorized owner signatures and preserves simulation, nonce, amount and terminal-state checks.
- Frontend production build completed successfully in `output/operations-build`; dependency annotation and bundle-size warnings remain.
- Scoped TypeScript validation of changed source passed using ES2022 and the exact `lucide-react@0.414.0` declarations extracted into a temporary check directory. The shared local node_modules installation is missing that package's advertised declaration file. No package version, lockfile or shared dependency tree was changed.
- The repository-wide default typecheck is not clean: it reports missing icon declarations, older library target incompatibilities, and diagnostics in existing modules. This pass does not claim a clean repository-wide typecheck.
- Playwright synthetic preview verified workspace switching, scoped API requests, runtime/approval distinction, external escalation copy, unauthorized pages making no protected data requests, one sign-out control, and no page overflow at 1440px and 390px. Light/dark screenshots were visually inspected. The fixture never calls live identity, payment or signing APIs.

Preview: `node scripts/operations-desktop-preview.mjs`, then open `http://127.0.0.1:4321/admin`. Browser checks: run Playwright CLI `run-code --filename=scripts/operations-desktop-browser-check.js` in the preview session. Images are under `output/playwright/operations-workspace-{desktop,mobile,dark}.png`.

## Remaining work and rollout conditions

### Live credential inventory follow-up

Read-only inspection of the deployed Hash PayStream environment and Hash PayLink project store confirmed seven registered projects. The main human integration's live draft key successfully authenticated to `GET /api/v2/project`. Seven live keys belong to that integration: agreement draft/read, funding/recipient, wallet connection, Arc wallet, stock balances, wallet swaps and Trade agreement creation/read. Only the draft key has `project:read`; a 401 on the metadata endpoint for the other scoped keys does not establish that their intended operations fail.

The remaining credential associations were compared using hashed stored key prefixes, without printing keys, prefixes, digests or database credentials. This is a metadata association, not a full authentication or execution test of each scoped credential. The registered live keys are neither revoked nor expired at inspection time.

Agents and Upfront each still have a test key configured on the deployed Hash PayStream service. The main integration also retains its test key. They are not deletion candidates merely because current human checkout uses live credentials. The older Arc Pilot has an unrevoked test key and webhook history; previous runtime inspection also found its ID in the Arc allowlist. No inspected project is approved for deletion by this audit.

A local, untracked rollout candidate in `.codex-temp/operations-production-candidate.json` now groups only the verified live human integration under Hash PayStream, grants founder access only to the supplied address, and leaves staff grants empty. The initial three-integration grouping was corrected after the user clarified that this workspace must follow the live portal's mainnet scope: configured legacy test credentials do not make an integration live. Agents, Upfront and the older pilot remain separately visible as registry entries pending dependency review; they are not members of the live Hash PayStream group. The candidate has not been applied to Render. No key issuance, revocation, project mutation or financial operation was performed. Store inspection used a read-only database transaction.

1. Credential metadata mapping and a local workspace configuration candidate are prepared. Before retiring older projects, check their outstanding agreements, activity and every deployed consumer; environment presence and stored webhook counts are not complete usage histories.
2. Before deployment, configure founder access and verified workspace mappings together; leave other grants empty. Recheck live sign-in, workspace data and denied routes after deployment. Retire the obsolete shared allowlist entries once their consumers are accounted for.
3. Build project-authenticated escalation submission, case assignment, evidence access, status updates and delivery back to the integrating product. This is not supplied by the current placeholder. External product support remains external.
4. The project-scoped Trade queue is now implemented locally. Its query filters project membership, Trade kind and supported custody before a 25-record keyset page; it returns only reference, title, project and last observed state/block. Operators can switch between observed disputes and all stored Trades, load more, or open an exact reference. Opening retains the existing chain verification and both reviewer approvals. Background discovery is not implemented: newly raised disputes appear only after the existing payment observer records them. The queue does not claim to be a complete automatic dispute inbox. Its query has now passed deployed Postgres validation; assess indexing as production volume grows.
5. Review legacy Hash PayStream projects for unused credentials, live bindings, pending agreements, webhook consumers and historical references before removing anything. Project deletion/archive and credential revocation have not been implemented or executed here.
6. Pagination and action-level grants can follow this boundary. Arc lists remain bounded (100 agreement/attempt/payer records and 250 operator actions per integration); they are not complete historical exports.

The current local result is the first working desktop and authorization foundation, not completion of every support, cleanup and deployment task.

Trade queue follow-up validation: the new handler smoke test passes section denial before storage, malformed filter/cursor rejection, unexpected foreign-row rejection, no chain calls and no mutations during listing. Existing reviewer signature and execution tests still pass. Scoped TypeScript checks pass. The synthetic preview bundle builds and Playwright verifies workspace parameters, exact case selection, filter switching and mobile overflow. The desktop screenshot was inspected. These synthetic checks do not validate production Postgres execution or live dispute discovery.

## Read-only production preflight

On 2 October 2026 the exact SQL extracted from `api/xstocks-agreement/review-queue.ts` was run against Hash PayLink's deployed Postgres in a `BEGIN READ ONLY` transaction with a 10-second statement timeout. No application handler, signer, key mutation or migration was executed. Output was restricted to counts and query-plan measurements.

- The candidate Hash PayStream workspace returned one observed dispute and seven stored supported Trades. Every returned row belonged to one of the configured project IDs.
- `EXPLAIN ANALYZE` measured approximately 3.05 ms for disputes and 2.94 ms for all Trades. Both used sequential scans of 329 storage rows. This supports current readiness, not a claim of scalability at larger volumes.
- The same SQL ran against a synthetic PostgreSQL CTE containing 60 records split across two projects. It passed cross-project filtering, the 25-plus-one page boundary, continuation without overlap, dispute-only filtering and empty-scope checks. No synthetic records were persisted.
- A separate read-only retirement preflight found no matching `partnerId`/`projectId` documents outside the developer-project registry or developer activity events for Agents, Upfront or the old Pilot in this database. This does not cover another service's database, other ownership field names, chain state or off-platform consumers. It is not proof that these projects can be deleted.
- The old Pilot remains referenced by Hash PayLink's `HASHPAYSTREAM_ARC_PROJECT_ID` and `ARC_AGREEMENT_ALLOWED_PROJECT_IDS`. Prior inspection also established deployed Hash PayStream test credentials for Agents and Upfront. None has been archived, deleted or revoked.

Source inspection of the separate Hash PayStream checkout found admin analytics and agreement-review tools but no customer-support inbox or payment-escalation connector in `api`/`src`. Product ownership of customer support is the agreed design, not evidence that an inbox already exists. Implement an explicit, authenticated payment/escrow escalation flow and product-visible case updates before claiming this integration is connected. Do not reuse Pocket conversations as an external product inbox.

The dashboard and candidate permissions remain local. Production query validation does not establish that the new operations endpoints, founder login or section isolation have been deployed or live-tested.

## Mainnet scope verification

Deployed Hash PayLink commit `e785be57e4c60e34524cd8e301597fed44da3b8f` contains the Live/Sandbox portal distinction, live-route test-credential and test-environment rejection, isolated Arc `5042` storage namespace, production Circle-key validation and the Trade live-request boundary. The deployed server does not yet mount the new operations-session endpoint.

The public developer-domain capabilities endpoint returned `sandboxPaymentsEnabled=false` and `sandboxKeysEnabled=false`. `GET /api/v2/agreements?environment=test` returned 409 with no live operation started. The local sandbox-boundary regression suite passed. These are verified environment boundaries, not a claim that every mainnet product is enabled: `ARC_AGREEMENTS_ENABLED=false` and the public Arc Agreements capability reports `draft_only`.

Live credentials for the main Hash PayStream integration were previously authenticated or associated with stored scoped-key metadata; Agents and Upfront only had legacy test credentials in the inspected deployment. Their presence must not be used to expand the live workspace. Registry visibility is distinct from executable payment environment: unmapped legacy project entries may remain visible to the founder until retirement is complete, while sandbox payment execution remains disabled.

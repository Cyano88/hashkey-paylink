# Developer portal predeployment re-audit - 2026-09-24

Scope: simplified developer navigation, project-bound credentials, and durable project activity for Checkout, Funding and Arc Agreement observations. This is a lifecycle evidence journal, not a complete accounting ledger.

Fixed during re-audit:
- Serialize journal schema initialization across processes with a transaction advisory lock.
- Write source state and journal records atomically; retain observations before source pruning.
- Reject legacy Arc testnet observations from live history; require mainnet provenance.
- Backfill only existing stores without creating or rewriting operational state.
- Bind newly issued keys and webhook secrets to their project across delayed requests and navigation.
- Reject unknown Gateway acceptance states and preserve Funding evidence across secondary synchronization failures.

Validation before release: isolated fresh dependency installation; production Vite build exit 0; scoped TypeScript check exit 0; developer project, CLI grants/project/keys, Checkout, Funding, Arc Agreement/webhook, activation policy, Gateway, Paycrest and durable TLS checks passed. Real PostgreSQL 18.6 tests passed for concurrent initialization, atomic rollback in both directions, deduplication, isolation, pagination, pruning and missing-store backfill. Synthetic browser delayed key and webhook-secret project-switch checks passed.

Read-only production preflight succeeded: compatible Checkout and Funding snapshots (14 each), no Agreement snapshots, journal schema creation permitted. No secrets or source records printed.

Deployment must preserve concurrent production releases. Sandbox execution, broader CLI product coverage and Agent network restriction are separate pending work. Agreement activation remains closed. Historical source records already pruned cannot be reconstructed.

Release rebased onto concurrent production commit 129fe3317729fda6185b8214b0fa6f17205ddec7, preserving assistant retirement and security fixes. Updated dependency versions installed; combined production build and scoped typecheck passed again.

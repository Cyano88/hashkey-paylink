# X Layer background billing receipt reuse - 2026-11-02

The first live provider-usage window exposed 30 receipt reads and 30 block reads in the background billing audit. This was a startup audit, not evidence of 60 calls every minute: successful scheduled audits already have a 15-minute cooldown.

Background audits now reuse bounded receipt contents for up to 30 minutes (512 entries per process), but read the canonical block again on every audit. Transactions sharing a block share one block lookup within that audit. A mismatch, missing receipt or RPC error fails closed and evicts affected cached receipt evidence. Expiry is fixed rather than sliding; restart and endpoint changes start cold. Returned receipts are copied to prevent mutation of cached evidence.

Payment preflight remains fresh: only the reconciliation scheduler opts into cross-audit receipt reuse. Prices, provider invoices, halt state and reimbursement matching are never cached. Scan and billing schedules are unchanged. This reduces warm receipt requests; canonical block reads remain necessary, and invoice-dollar savings have not been measured.

Validation: receipt-cache smoke covers warm reuse, fresh canonical checks, coalescing, reorg and outage eviction, expiry, bounds, missing proof and restart. Existing billing guard and expanded reimbursement tests pass, including halt, exact treasury/token/amount, depeg, wallet scope and unavailable evidence. Existing RPC cost-control and native reconciliation tests and targeted backend typecheck pass.

Live: commit 5e80927235b8465f8d557392b677b7410b10bfad, Render deployment dep-dbjsid67bikc738el1h0, live 2026-11-01 23:27:02.362 UTC. Build passed. Transition 502 recovered; health reports healthy database and zero unresolved/stale payments. A read-only SSH check imported the deployed reader and used an existing durable sponsorship transaction against the configured X Layer RPC: chain ID verified; two separate audit reads required one receipt request and two fresh canonical block requests. No transaction was sent, no stored payment state changed, and this isolated check does not establish steady-state invoice savings.

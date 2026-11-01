# X Layer background billing receipt reuse - 2026-11-02

The first live provider-usage window exposed 30 receipt reads and 30 block reads in the background billing audit. This was a startup audit, not evidence of 60 calls every minute: successful scheduled audits already have a 15-minute cooldown.

Background audits now reuse bounded receipt contents for up to 30 minutes (512 entries per process), but read the canonical block again on every audit. Transactions sharing a block share one block lookup within that audit. A mismatch, missing receipt or RPC error fails closed and evicts affected cached receipt evidence. Expiry is fixed rather than sliding; restart and endpoint changes start cold. Returned receipts are copied to prevent mutation of cached evidence.

Payment preflight remains fresh: only the reconciliation scheduler opts into cross-audit receipt reuse. Prices, provider invoices, halt state and reimbursement matching are never cached. Scan and billing schedules are unchanged. This reduces warm receipt requests; canonical block reads remain necessary, and invoice-dollar savings have not been measured.

Validation: receipt-cache smoke covers warm reuse, fresh canonical checks, coalescing, reorg and outage eviction, expiry, bounds, missing proof and restart. Existing billing guard and expanded reimbursement tests pass, including halt, exact treasury/token/amount, depeg, wallet scope and unavailable evidence. Existing RPC cost-control and native reconciliation tests and targeted backend typecheck pass.

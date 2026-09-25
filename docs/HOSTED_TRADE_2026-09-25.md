# Hosted xStocks Trade checkout

Trade reuses `/api/v2/xstocks-agreements` and `/agreements/xstocks/:id`; POST drafts include `kind: "trade"` and the preserved `trade` terms. Work Agreement requests keep their existing behavior. GET accepts `idempotencyKey` for project-scoped recovery after an uncertain create response. GET `purpose=assets&kind=trade` reads the same approved token registry and on-chain planner under the Trade gate.

Trade binds offer ID, listing revision, snapshot SHA-256, exact item quantity plus delivery fee, handover/location/carrier/return terms, dispatch/delivery/inspection deadlines, participants and verified hosted wallets. The hosted UI uses buyer/seller language and the existing confirmation, exact approval, hidden Privy UI and transaction-recovery implementation. No developer key signs or releases funds.

Rollout requires `HASHPAYLINK_TRADE_XSTOCKS_ENABLED=true` and the exact project ID in `HASHPAYLINK_TRADE_XSTOCKS_PROJECTS`, plus its existing xstocks_agreements project capability. This does not enable Work Agreements globally. Removing the gate blocks new acceptance/funding but retains participant release/refund/dispute access. Ordinary project suspension/auth restrictions still apply.

CLI `hosting plan --product xstocks-agreement` accepts only `xstocks-agreement:read,xstocks-agreement:create`, targeting `HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY` on Render. Wallet-read, checkout and mixed-permission keys are rejected. Secrets remain in the encrypted local vault and server environment.

Validation: new Trade HTTP/terms tests, existing Agreement HTTP/adapter tests, shared UI work and Trade signing tests, and all 39 CLI tests pass. Platform TypeScript still reports existing unrelated errors; no changed checkout module appears in those diagnostics. Production build/deployment and financial end-to-end results must be recorded separately; no funds have moved in this implementation session.

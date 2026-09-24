# Agent checkout network policy - 2026-09-24

Scope: enforce Base and Arc for new agent checkout payments. Human checkout routes and live-only Polymarket Funding remain unchanged. Sandbox execution, expanded Agreement/Funding CLI commands and Agreement mainnet activation are not enabled.

Predeployment re-audit found Arbitrum still accepted through project routing and direct Gateway checkout endpoints. The change shares the Base/Arc policy between portal settings and server validation, filters existing project-key routes, rejects unsupported project configuration and new credentials, and blocks new unsupported checkout/payment attempts before contacting Gateway. CLI project/doctor reads inherit the filtered server policy; no new CLI product commands are claimed.

History boundary: already paid legacy checkouts remain readable, and previously submitted Gateway attempts can reconcile. New challenges/payment attempts on retired networks are rejected. No project state or historical records are bulk rewritten. Existing projects can remove unsupported routes explicitly in Settings; fresh Base recipient configuration remains required if no eligible route survives.

Validation: hosted checkout, agent Gateway, authenticated wallet-payment, developer project and CLI project adapter tests pass; Funding regression passes; all 34 CLI tests pass. New negative cases cover legacy keys, unsupported configuration/key issuance, new checkouts, and no Gateway/attempt side effects. Historical paid replay and submitted-attempt reconciliation pass. Synthetic browser removal/save flow checks the persisted request routes. Production build and scoped TypeScript check pass. A broader exploratory wallet-module typecheck surfaced existing Solana/ES-library diagnostics; the unchanged wallet endpoint was excluded from this change, and its regression passed.

The synthetic preview initially lacked its logo asset, generating 404s; the local asset was supplied before the final interaction check. No real credentials, financial transactions or project writes were used in browser tests.

# Hosted Agreement release

Based on the verified live commit a296071ef, merged with dfc499cd5. Preserves newer Pocket production changes. The single Circle device-registration conflict retains fresh SDK registration and removes unregistered UUID fallback. Includes the already prepared consent-based hosted account connection and Agreement-only xStocks checkout.

Explicit new scopes:
- agreement:recipient: signed verified-recipient registration only.
- agreement:fund: project-payer brand, link-wallet, review, status, prepare, challenge, recover and record only. The existing payer capability, project, email, wallet ownership and Circle approval checks still apply.
- Existing wallet:connect: create/redeem consent-based account links only.

No existing grant or key gains these scopes. Lifecycle release/refund/cancel, delivery decisions, arbitrary signing, checkout, and participant API authentication are not granted by the funding scope. Funding and connection keys require a new owner-approved grant. CLI Render targets are separate backend-only variables; plan/apply verify exact scope sets and never trigger deployment.

Tests passed: CLI grants and key enforcement, wallet connections, all xStocks Agreement suites (UI uses the existing supported HASHPAYLINK_TEST_RUNTIME_PACKAGE), Circle device registration, recipient signature checks, payer adapter, 10 hosting handoff tests and 27 CLI tests. Production Vite build passed. Full TypeScript reports existing errors in unchanged legacy/Pocket files; none of the reported diagnostics concerns added API or UI modules. This is not a clean repository-wide typecheck.

Deployment does not enable Circle wallet cutover, xStocks execution or Arc Agreement execution. Hash PayStream's new adapter and migration code are still local. Hosted identity linking alone does not replace the app's Circle provider transport. Mainnet activation must remain off until that transport and real wallet session are verified.

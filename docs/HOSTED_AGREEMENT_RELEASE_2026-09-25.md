# Hosted Agreement release

Based on the verified live commit a296071ef, merged with dfc499cd5. Preserves newer Pocket production changes. The single Circle device-registration conflict retains fresh SDK registration and removes unregistered UUID fallback. Includes the already prepared consent-based hosted account connection and Agreement-only xStocks checkout.

Explicit new scopes:
- agreement:recipient: signed verified-recipient registration only.
- agreement:fund: project-payer brand, link-wallet, review, status, prepare, challenge, recover and record only. The existing payer capability, project, email, wallet ownership and Circle approval checks still apply.
- Existing wallet:connect: create/redeem consent-based account links only.

No existing grant or key gains these scopes. Lifecycle release/refund/cancel, delivery decisions, arbitrary signing, checkout, and participant API authentication are not granted by the funding scope. Funding and connection keys require a new owner-approved grant. CLI Render targets are separate backend-only variables; plan/apply verify exact scope sets and never trigger deployment.

Tests passed: CLI grants and key enforcement, wallet connections, all xStocks Agreement suites (UI uses the existing supported HASHPAYLINK_TEST_RUNTIME_PACKAGE), Circle device registration, recipient signature checks, payer adapter, 10 hosting handoff tests and 27 CLI tests. Production Vite build passed. Full TypeScript reports existing errors in unchanged legacy/Pocket files; none of the reported diagnostics concerns added API or UI modules. This is not a clean repository-wide typecheck.

Deployment does not enable Circle wallet cutover, xStocks execution or Arc Agreement execution. Hash PayStream's new adapter and migration code are still local. Hosted identity linking alone does not replace the app's Circle provider transport. Mainnet activation must remain off until that transport and real wallet session are verified.

## Hosted Arc wallet transport

The additional wallet:arc scope serves /api/v2/wallets/arc. It keeps CIRCLE_API_KEY on Hash PayLink; Hash PayStream holds only HASHPAYSTREAM_ARC_WALLET_API_KEY. The endpoint allowlists OTP, refresh, Arc SCA initialization/creation, owned-wallet reads, canonical single-USDC-transfer challenges and bounded project-owned recovery. It cannot prepare arbitrary contract calls, token approvals, other chains, or developer-controlled signatures. Every money movement still needs Circle user approval. Project recovery only returns namespaced transactions from wallets proven by Circle user sessions. Request IDs are namespaced by project.

Validation: Arc handler misuse/isolation tests, actual Hash PayStream-to-Hash PayLink handler contract test, scoped key tests, CLI handoff tests and targeted API TypeScript all passed. The previous deployment failed before build because react-test-renderer additions were absent from package-lock.json; the lockfile now contains those three missing dependencies and npm ci dry-run passes.

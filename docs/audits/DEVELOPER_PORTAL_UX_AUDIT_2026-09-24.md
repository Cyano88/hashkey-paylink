# Developer portal audit - 2026-09-24

Status: local UX foundation implemented; not deployed. This is not production readiness approval.

## Agreed product boundaries

| Product | Live | Sandbox target |
| --- | --- | --- |
| Human Checkout | Supported configured routes | Corresponding supported testnets |
| Agent Checkout | Base and Arc only (backend restriction pending) | Base Sepolia and Arc testnet |
| Agreements | Arc only; reviewed activation gate remains closed | Arc testnet with reviewed deployment |
| Polymarket Funding | Existing Base and Arbitrum bridge routes | Excluded; no simulated bridge completion |

## Journey review and changes

- Entry and authentication: retained existing identity flow; added distinct failed-load/retry state so a network failure does not appear to be an empty account. Ignore stale project loads after identity changes.
- Project navigation: Overview, Products, Activity, API keys, Webhooks, Docs & CLI, Settings. Project and section links persist in the URL. Guard unsaved settings and clear displayed secrets on project switches.
- Overview: actual setup progress and next action, without invented financial metrics. Project configuration and approval are distinguished from settlement and Agreement activation readiness.
- Visual system: developer-specific layout using the shared Plus Jakarta Sans font, consistent primary CTAs, larger small text, focus indicators and reduced-motion support. Removed the generic layout's duplicate padding.
- Products and environments: explicit capability restrictions; Sandbox is an informational unavailable state, not an enabled payment environment.
- Keys and CLI authorization: preserved owner, scope, expiration and revocation controls. Clarified unavailable sandbox keys and current CLI limitations. No real keys issued in this audit.
- Webhooks: editing and saving the endpoint no longer submits unrelated unsaved settings. Secret creation requires the current endpoint to be saved.
- Integration guides: added a Funding-only example and unified the documented HASHPAYLINK_API_KEY variable. Funding payment acknowledgement must not be treated as bridge completion.
- Activity: searchable project webhook delivery records with event reference, HTTP result and errors. Explicitly a limited delivery log, not complete financial history or dispute evidence.
- Operations: existing privileged operations surface and authorization retained; full admin interaction redesign is not part of this implementation.

## Remaining work before the promised platform is complete

1. Durable project transaction journal: persist lifecycle events across checkout, Agreement and Funding, with project/environment ownership, idempotency, verified settlement references, provider references and exportable evidence. Current expiring checkout records and bounded webhook delivery arrays are not sufficient for dispute history.
2. Real sandbox: bind environment to keys, records, network/provider adapters and webhook events on the server. Fail closed for unsupported routes. Do not enable the preview switch until this works end to end.
3. Agent network policy: enforce Base/Arc on the server, including existing projects. UI descriptions are not enforcement.
4. CLI extension: Agreement/Funding commands and scopes, environment-aware configuration and correct app-specific secret delivery. Existing CLI covers human checkout only.
5. Agreement activation: reviewed deployment and production prerequisites remain required. No bypass or contract deployment performed.
6. Settings still contains detailed product configuration. Further split and conditionally show fields per selected product after backend capability policy is unified.

## Validation

- Production Vite build passed with isolated output at C:/Users/USER/developer-portal-dist. Existing dependency annotation/chunk warnings remain.
- Developer project adapter, CLI grants and scoped CLI key smoke tests passed.
- Synthetic browser preview renders the actual portal with local mock identity and project APIs; no production API calls or funds movement.
- Desktop and 390px mobile screenshots captured under output/playwright. Mobile Activity measured document width 390px at viewport width 390px.
- Browser checks: Sandbox shows unavailable state and disables new-project creation; direct project selection loads the Funding project; its Activity is empty and does not show the other project's event; Funding-only guide shows the Funding endpoint and current CLI limits.
- Screenshots were captured, but the image viewer stalled; do not treat captures as completed visual sign-off.
- Compiler verification and failed-load browser result are recorded in the follow-up validation note below.

## Files

src/surfaces/DeveloperLayout.tsx, src/surfaces/DeveloperApp.tsx, src/developer/PortalPanels.tsx, src/developer/developer.css, src/pages/DeveloperPortalPage.tsx, src/pages/DeveloperCliAccessPage.tsx. Local synthetic preview: scripts/developer-portal-preview.mjs.

### Follow-up validation

The failed-load browser scenario passed: an explicit error and Try again button appeared, without a misleading create-project screen. The Funding-only project showed no deliveries from the other project. Final mobile screenshot: output/playwright/developer-overview-mobile-final.png. Three malformed separators were corrected and the preview rebundled successfully. Scoped git diff --check passed.

The full TypeScript check did not produce diagnostics within this audit's validation window and was stopped; no clean typecheck is claimed. An earlier platform audit recorded repository-wide type errors. Production build success does not replace a completed typecheck. Complete compiler validation and visual sign-off before deployment.

### Activity implementation follow-up

The limited delivery-only Activity view has been replaced locally by the durable lifecycle journal described in DEVELOPER_ACTIVITY_IMPLEMENTATION_2026-09-24.md. Deployment, staging PostgreSQL verification and historical backfill remain pending. Other outstanding platform scope above is unchanged.

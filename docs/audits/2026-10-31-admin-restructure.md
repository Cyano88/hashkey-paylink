# Admin restructure and case escalation - 2026-10-31

## Implemented

- Admin uses the developer portal visual system: desktop sidebar, mobile modal navigation, shared branding, a server-derived role next to Sign out, and a concise staff sign-in page. No role selector or staff self-enrolment.
- Sections: Overview, Verification, Businesses, Payments, Support, Products, Team & access, Audit log, Settings. Menus follow the authenticated server session; direct routes and API actions remain independently authorized.
- Roles: Owner (existing founder configuration), Administrator, Compliance, Legal, Support, Product Manager, Engineer. Staff grants stay scoped to existing workspaces. Only Owner manages access; existing owner configuration and staff grants are preserved. Revocation remains fail-closed through the durable grant store.
- Pocket and Business support are separate queues. Business case creation verifies that a supplied checkout belongs to the selected merchant. Purchase complaints require an order reference and checkout ID. Recorded payment details are copied from verified checkout records; order references/evidence are staff-supplied and are not payment proof.
- Escalate requires a destination (Compliance/Legal) and reason. Support ownership stays unchanged. The original conversation, evidence, merchant/checkout/payment references and append-only case history remain connected to the same case. Only the assigned review team or Owner can record the decision.
- Pending reviews block case closure. Pocket automatic reminders/closure pause while a specialist review is pending. Customer APIs exclude internal escalation details and internal case history. No funds, refunds, verification status or payment-provider state change as a side effect.
- Verification documents/downloads/decisions require Compliance or Owner, including direct API requests. Business KYB is kept separate from individual profiles. Pocket identity issues use the scoped review-case queue; automated personal verification is not replaced with a manual approval shortcut.
- The owner audit index combines team access, verification, business operations and Pocket/Business case events. Private notes/documents are not copied into the index.
- Removed apps are excluded from the active admin session. Businesses can be searched and filtered by their stored Production/Sandbox environment. Names containing “test” do not alter their environment.
- Emergency controls moved to Settings. Existing agreement, trade-review and reconciliation API boundaries remain intact; no escrow-signing authority is added.

## Deliberate limits

Business cases are staff-created at this stage. Merchant/customer self-service intake, external support email delivery and automatic chargebacks/refunds are not introduced. Evidence accepts HTTPS links; binary document upload is not part of this case endpoint. The Products menu exposes existing configured capabilities; it does not introduce new product activation permissions. Payments retains the existing Pocket investigation surface; business payment context is available through verified linked cases. Personal KYC exception review is a case workflow, not a new provider KYC adjudication system.

## Validation

`operations-roles-smoke.mjs`, `operations-workspace-smoke.mjs`, `operations-cases-smoke.mjs`, `admin-restructure-browser-smoke.mjs`, `developer-verification-smoke.mjs`, `pocket-support-lifecycle-smoke.mjs`, and `pocket-support-resolution-smoke.mjs`.

Tests exercise cross-workspace isolation, checkout ownership, stale updates, safe evidence links, staff/reviewer separation, retained assignment, owner-only combined audit, no private-note leakage, queued review preventing auto-close, existing KYB approval/download gates and mobile/desktop navigation. Browser case creation/escalation/review uses synthetic data. No live case, grant, KYB approval, payment or customer message is created during verification.

Unrelated billing changes in server.ts and untracked project-billing files are excluded. Generated dist files are excluded.

TypeScript verification: 43 existing baseline errors, zero new diagnostics. Production build and targeted fixture/browser checks passed. Pocket review completion clears stale resolution timers and returns the case to Support rather than immediately auto-closing it.

## Live verification

Commit 7360b66ff3148aa0fc4604629a1c69da2acfdacd went live on Render deployment dep-dbimsjs9v7es73827af0 at 2026-10-31 04:33:12 UTC. Playwright checked the existing authenticated Chrome admin tab: Owner beside a single Sign out button, sidebar navigation, existing Pocket inbox and case escalation section, Lunchroom Business support empty queue and new-case fields, all six assignable staff roles for a business workspace, owner-only audit index rendering 31 stored events, and Lunchroom verification entry point. The tab was returned to Overview. Existing unsaved developer settings and the business application tab were preserved. No live case, escalation, grant, approval, payment or message was submitted. Full escalation mutations were tested with synthetic fixtures. Screenshot: output/playwright/admin-live-overview.png. Existing browser extension unload-policy errors and Privy connector warning remain; no new admin request failure was observed during these checks.


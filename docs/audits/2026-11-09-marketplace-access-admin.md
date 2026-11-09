# Marketplace access and admin release - 2026-11-09

Developers can request Marketplace Payments access from their app Payments tab using the verified email linked to their signed-in account. Requests persist as pending and cannot grant themselves access. Authorized founder admins review, approve, reject or revoke requests under Marketplace. Decisions use optimistic concurrency and record reviewer, timestamp and note.

The admin overview and Apps by product view separate Checkout, Polymarket Funding and Marketplace. Approved marketplace requests appear in Marketplace without changing production capabilities. Multi-product apps appear in each applicable section. Scope and current app ownership constrain summary metadata.

Validation: full TypeScript check passed after restoring the scanner review state variables; focused diagnostics, source build, marketplace smoke suites and responsive portal/admin browser fixtures were run. Browser fixtures cover request/reload, approval/revocation, product grouping, hidden workspaces and widths 320, 390 and 1280. They do not prove a live signed-in request or money movement.

Additional audit fixes in this release: unsubmitted payout reservations can be cancelled with provenance restored and stale claims fenced; submitted transfers cannot be cancelled this way. Base deployed smart-contract beneficiary signatures can be checked through ERC-1271 with an injected chain client. Scanner fixtures were repaired to exercise the existing child-owned back action.

## Production boundary

The live baseline before release was d8a367dbd44f65a0147922aa88e0a7c9de5e6538 on Render service srv-d7ilg0osfn5c73eaedf0. Existing Circle, Paycrest and database credentials were present, but dedicated marketplace runtime configuration and activation adapters were absent. No credentials are recorded here.

This release enables access requests and administrative review only. Marketplace financial routes and workers remain inactive. Approval is rollout eligibility, not an automatic production payment capability grant.

Remaining financial activation work includes authoritative collection/funding verification, production project authentication, dedicated holding wallet policy, wallet and bank execution wiring, refund proof verification, real-database concurrency validation, and an end-to-end live payment/release/refund pilot. Existing fixture passes must not be represented as live settlement evidence.

# Marketplace access and admin release - 2026-11-09

Developers can request Marketplace Payments access from their app Payments tab using the verified email linked to their signed-in account. Requests persist as pending and cannot grant themselves access. Authorized founder admins review, approve, reject or revoke requests under Marketplace. Decisions use optimistic concurrency and record reviewer, timestamp and note.

The admin overview and Apps by product view separate Checkout, Polymarket Funding and Marketplace. Approved marketplace requests appear in Marketplace without changing production capabilities. Multi-product apps appear in each applicable section. Scope and current app ownership constrain summary metadata.

Validation: full TypeScript check passed after restoring the scanner review state variables; focused diagnostics, source build, marketplace smoke suites and responsive portal/admin browser fixtures were run. Browser fixtures cover request/reload, approval/revocation, product grouping, hidden workspaces and widths 320, 390 and 1280. They do not prove a live signed-in request or money movement.

Additional audit fixes in this release: unsubmitted payout reservations can be cancelled with provenance restored and stale claims fenced; submitted transfers cannot be cancelled this way. Base deployed smart-contract beneficiary signatures can be checked through ERC-1271 with an injected chain client. Scanner fixtures were repaired to exercise the existing child-owned back action.

## Production boundary

The live baseline before release was d8a367dbd44f65a0147922aa88e0a7c9de5e6538 on Render service srv-d7ilg0osfn5c73eaedf0. Existing Circle, Paycrest and database credentials were present, but dedicated marketplace runtime configuration and activation adapters were absent. No credentials are recorded here.

This release enables access requests and administrative review only. Marketplace financial routes and workers remain inactive. Approval is rollout eligibility, not an automatic production payment capability grant.

Remaining financial activation work includes authoritative collection/funding verification, production project authentication, dedicated holding wallet policy, wallet and bank execution wiring, refund proof verification, real-database concurrency validation, and an end-to-end live payment/release/refund pilot. Existing fixture passes must not be represented as live settlement evidence.

## Next dependency: developer instruction authentication

The internal instruction service now defaults to the durable developer API-key adapter in `api/marketplace/authorization.ts`. It reuses the portal HMAC digest format and re-reads project/key and whitelist state for every request. It requires all of:

- `MARKETPLACE_INSTRUCTIONS_ENABLED=true` and explicit `MARKETPLACE_PROJECT_IDS` rollout inclusion.
- An active business app with approved business verification and the Marketplace capability configured.
- Exactly one approved whitelist request belonging to the current app owner.
- A matching, unrevoked, unexpired general live API key; scoped app/CLI/test keys are denied.

General live keys carry the app's read, release, payout and refund authority. No new key issuance or scope-grant UI is exposed. Missing or ambiguous records fail closed. A storage failure propagates and cannot authorize a command. The existing instruction gate also stays disabled by default.

Validation: authorization smoke tests cover digest matching, configuration gates, owner transfer, suspended/removed apps, verification, key expiry/revocation, request rejection/revocation, duplicate records, storage failure, and denial before repository access. Existing instruction regressions and focused TypeScript checks pass. These are local fixtures, not live provider or database concurrency evidence.

This closes the credential-resolution implementation gap only. No public financial endpoints, production configuration, holding wallets or funds were changed. Workers must still recheck custody/fee authority immediately before submission; the refund runtime's execution-authority adapter remains a separate blocker. Collection verification and live settlement remain outstanding.

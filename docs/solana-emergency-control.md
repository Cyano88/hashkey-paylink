# Solana sponsor emergency control

Scope: the server Solana sponsor used by checkout/send, CCTP bridge preparation and Relay USDT bridge preparation, plus the public Solana broadcast endpoint. This is not a platform-wide pause; Circle, Privy EVM, treasury refunds and other networks are not covered by this control.

## Access

The existing verified operations identity is required. Owners from OPERATIONS_FOUNDER_EMAILS can pause and request/approve resumption. Additional named responders can be set using OPERATIONS_PAUSE_RESPONDER_EMAILS. Additional named resume reviewers can be set using OPERATIONS_RESUME_APPROVER_EMAILS. Both are comma-separated verified email addresses. Engineering, support and compliance roles alone confer no permission on this global Solana control.

A resume request requires a reason and a different authorized user ID AND email to approve it. Configure a second responsible person before relying on resumption. Pausing again cancels a pending resume request. No shared ADMIN_SECRET bypass is provided.

## Enforcement and persistence

GET/POST /api/operations-emergency-pause is authenticated. State and history are changed atomically using the durable PostgreSQL row lock. Revisions reject stale requests and repeated approvals. Every new sponsor signature checks current state without caching; unavailable or malformed storage blocks signing. Public relay also checks before broadcasting. No key material is stored in the audit history.

Already signed transactions may be broadcast directly to a blockchain RPC, and submitted transfers cannot be undone. The control does not stop read-only tracking, receipts or balances. A new installation with no state record starts running. Database access, backups and protection against state deletion remain infrastructure responsibilities.

## Verification

- node --import tsx scripts/emergency-pause-smoke.mjs
- node scripts/emergency-pause-signing-smoke.mjs

The signing suite bundles existing Solana fixtures with isolated durable-store responses and checks both running and paused states. It never contacts a live chain or moves funds. Existing standalone signing fixtures need this durable-store fixture when exercising the newly protected paths.

The panel is on the operations overview and names its Solana-only scope. Do not label it a platform-wide emergency pause until all other signing and provider execution boundaries have equivalent coverage.

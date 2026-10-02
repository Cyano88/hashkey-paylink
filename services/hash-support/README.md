# Hash Support service - private pilot foundation

Independent Node service and PostgreSQL database. This is the workspace, authentication and conversation-storage foundation, not the complete support SaaS. Pocket still uses its existing live support flow. No AI inference, automatic learning, model training or 0G storage uploads occur here.

## Run

Node 22+, npm ci, then set DATABASE_URL (dedicated PostgreSQL), HASH_ADMIN_SECRET and HASH_SESSION_SECRET (independent random secrets, at least 32 characters). npm start. The database role must not have superuser or BYPASSRLS. Migrations run transactionally under an advisory lock. A missing database or unsafe role fails startup.

Render: separate service, Oregon, services/hash-support root, npm ci --omit=dev, npm start, /healthz. Use the database's internal URL and ipAllowList: [] to disable external connections. Initial compute estimate $7 service + $6 database monthly, with database storage/usage charged separately; verify account pricing. No autoscaling. Keep operator credentials off the browser. Do not clone Pocket's environment or secrets.

## Server integration

- POST /internal/workspaces with operator Bearer secret and {name}: returns workspaceId, keyId and apiKey once. Store the API key securely on the integrator's server. Hash persists its SHA-256 digest only.
- DELETE /internal/keys/:id with operator secret revokes the key and sessions derived from it.
- POST /v1/customer-sessions with business Bearer API key and {customerId}: returns a 5-minute signed session. The integrator must derive customerId from its own authenticated session, never an arbitrary browser-submitted ID.
- POST /v1/conversations with customer Bearer session: creates a private conversation.
- POST /v1/conversations/:id/messages with customer session and {requestId,message}: requestId must contain 16-80 letters/digits/underscores/hyphens. Same ID/content is idempotent; changed content returns 409.
- GET /v1/conversations/:id with customer session: returns up to 200 messages.
- DELETE /v1/conversations/:id with customer session deletes that customer's conversation and messages from the live database. Backups follow the database retention policy, not instant erasure.

All endpoints are server integration only in this increment; no permissive CORS or public self-registration. No fabricated AI replies or human-support queue claims. A signed customer session derives business/customer scope; payload workspace IDs grant no access. SQL row-level security plus explicit query filters enforce scope. API errors omit database details. Rate limits are per process; this pilot is single-instance. Add shared limits before scaling horizontally.

## Validation

npm test uses a PostgreSQL engine via PGlite under a non-superuser, non-BYPASSRLS role. Tests cover migrations, database-level isolation even without WHERE clauses, business and customer boundaries, HMAC tampering/expiry, key revocation, hashed key persistence, message idempotency and deletion. Production smoke uses synthetic workspaces and revokes test keys.

## Next

Business/staff membership and support inbox, knowledge migration, controlled Pocket adapter/cutover with rollback, durable usage accounting, dedicated 0G key with spending caps, then external pilot onboarding. No production-readiness claim for public SaaS onboarding yet.

## Pocket compatibility integration

The server-only `/v1/integration-state` endpoint accepts a business API key, never a customer session. GET returns the workspace's revision and document; PUT requires its current revision and a JSON object. PostgreSQL row-level security enforces workspace isolation. Conflicting writes return 409. An identical retry of the immediately preceding write returns its committed revision. Maximum payload: 8 MiB.

This preserves Pocket's existing inbox, customer authorization, human handoff, resolution, staff profiles and reviewed knowledge while storage moves to this service. It is a temporary, whole-workspace compatibility boundary for Pocket's trusted backend, not an external multi-business staff API. Before external pilots, replace this document boundary with paginated cases, explicit staff memberships/roles and per-record operations.

## Private 0G connection

`HASH_0G_API_KEY` is server-only. The operator-authenticated POST `/internal/inference-check` submits one fixed synthetic prompt to `0gm-1.0-35b-a3b` with Private routing. It accepts no user prompt, performs no retries or Standard fallback, and never returns upstream error bodies. PostgreSQL reserves at most 20 checks / 10,240 conservative token units per UTC day; reservations survive restart and remain consumed after ambiguous failures. The fixed prompt and 64 output-token ceiling keep each check bounded. The key's provider-side credit limit is separate and must remain configured in 0G.

This verifies the deployed inference connection. It does not enable customer-facing generated replies, model training or transcript uploads. Health still reports customer inference disabled. Before opening customer inference, add per-business/customer metering and evaluated evidence-grounded answers/handoff; do not reuse this operator-only check as a chat endpoint.

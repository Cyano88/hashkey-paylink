# Pocket PayLinks endpoint migration

## Change
Agent Hash creates shareable links through /api/pocket/paylink-requests using pocketApiUrl, which targets the Pocket HTTPS origin in native Capacitor and a relative URL on web. Direct user-to-user /api/pocket/requests is a different flow and remains unchanged.

The implementation now lives in api/pocket/paylink-requests.ts. /api/telegram-request reexports the same handler for installed clients and other legacy callers. Both routes have strictLimiter and share the module-level store mutation queue. Existing request IDs, event IDs, URLs, public GET behavior, authentication, action journal and response shape remain identical. Source equality was verified apart from relative import paths.

## Compatibility and security checks
Synthetic compatibility tests passed: missing authentication rejected, invalid wallet/idempotency rejected, concurrent old/new calls create one record and one request ID, both endpoints read the same record, private owner/idempotency fields stay excluded, unsupported methods rejected. Existing Pocket agent security and agent adapter tests passed. Focused API TypeScript check passed.

This migration does not strengthen the inherited identity policy: verified Privy bearer identity is preferred, with the existing helper-session identity fallback retained for compatibility. Do not describe this endpoint as Privy-only. Public request-by-ID reads remain unchanged.

## Data and configuration retention
Do NOT delete TELEGRAM_REQUEST_STORE or data/telegram-requests.json yet. Renaming a route does not migrate stored data. Existing file-backed storage and its process-local concurrency protection are unchanged; durable storage, fail-closed read errors and multi-instance behavior need a separate reviewed migration. No keys, production records or configuration were deleted or rotated in this stage.

## Verification limits
No authenticated installed-mobile run, real customer request, or funded transaction was executed. Production verification should use unauthenticated and missing-ID requests only. Two previously documented unrelated broad-suite assertion failures remain outside this stage.

Production Vite build passed in 2m11s using .codex-temp/pocket-paylinks-build; tracked dist was preserved. Existing dependency annotation, eval and chunk-size warnings remain.

# Hash Support foundation

Checkpoint: 2026-10-01. Pocket is the first integration; external business onboarding is not live.

## Simplified recommendation

Build one reusable support service around approved business knowledge, verified live transaction evidence and human handoff. Use 0G Compute to explain and summarise only after a dedicated server-side API key and usage controls exist. Do not install automatic conversation-capture memory into Pocket.

## Implemented first increment

- Generic knowledge rules in api/hash-support/knowledge.ts. Each record belongs to a business, with draft/approved/retired status, version, author, reviewer, timestamps and 90-day review expiry.
- Pocket adapter derives the business on the server. A browser cannot choose another business. Existing staff authentication protects all knowledge actions.
- In the Support operations inbox, select a resolved case and open Hash knowledge. Write a general question and answer, save the draft, review the content, then publish it. Withdrawal removes it from future retrieval.
- Drafting does not copy the transcript. A conservative screen catches common identifiers and known source-case details; this is not complete anonymisation. Human review remains necessary.
- The chat reuses only exact-normalised, approved, unexpired general-question matches. Each reused response records the knowledge ID and version. Customer-specific payment questions do not use remembered payment states. Existing human handoff always takes priority.
- Raw chats and knowledge remain in the private existing store. No new 0G calls, uploads or key changes were made.

## Separation requested by the user

After this increment, create a separate 0G project/API key and a standalone Hash web service. Pocket becomes its first server-authenticated client. Other businesses receive Hash API keys, never the upstream 0G key.

The standalone service needs business workspaces and role-based staff membership, hashed and revocable customer API keys, server-signed customer identity, independently scoped storage/search, a support inbox, approved knowledge and usage/billing limits. Customer-supplied business IDs must never authorize access.

Keep payment tools read-only initially. Determine status from authenticated provider/backend evidence, including freshness and source, then let the model explain it. Do not allow the model to approve payments, create refunds or change identity records.

Build sequence:
1. Reviewed knowledge foundation in Pocket (this increment).
2. Dedicated Hash service and business authentication/storage isolation; migrate Pocket through an adapter with rollback.
3. Dedicated 0G Compute key, model evaluation, strict per-business and global spending caps, metering and fallback to staff when unavailable.
4. AI-generated lesson proposals from redacted, resolved cases; staff approval and regression checks before publishing.
5. External pilot businesses, integration guide and paid plans after measured operating costs.

0G Memory/Storage adoption remains a separate audit: retention/deletion, encryption and key ownership must be designed before storing customer content. Approved sanitised knowledge versions are the first candidate; raw chats and KYC are excluded from public storage.

## Validation

- scripts/hash-support-handler-smoke.mjs: actual HTTP handler with isolated dependencies verifies staff access, fixed business scope, source-case validation, privacy rejection, draft approval, chat integration, idempotency, customer isolation and withdrawal. This caught and fixed a missing knowledge argument in the live chat handler.
- scripts/hash-support-knowledge-smoke.mjs: business isolation, approval requirement, stale versions, duplicate approval, expiry, sensitive-data screens, response provenance, withdrawal and handoff priority.
- scripts/hash-support-knowledge-browser-smoke.mjs: draft, review checkbox, publish and withdraw against the real knowledge rules. Synthetic fixture only.
- Existing conversation, lifecycle and resolution tests passed. Changed-code TypeScript diagnostics: zero. Browser draft/published screens inspected.

This is a first reusable component, not a complete multi-business SaaS launch, semantic memory engine or live 0G inference integration.

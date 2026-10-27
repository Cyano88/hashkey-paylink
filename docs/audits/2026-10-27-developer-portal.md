# Developer portal completion — 27 October 2026

## Delivered scope

- Apps home and two-step creation; human checkout and Polymarket funding only for new integrations. Existing integration compatibility remains intact.
- Four primary sections: Overview, Payments, Developers, Settings. Profile and sign-out are in the header.
- Payment-level Activity, chronological pagination, linked funding/checkout deduplication, exact reference search, and export of loaded records. Status uses canonical records and retained evidence. Missing historical evidence is explicitly unavailable, never inferred as unpaid from age alone.
- New Polymarket funding requests default to 48 hours; existing expiry timestamps are unchanged. Processing/paid evidence takes precedence over expiry.
- Business verification: company, beneficial owners/control persons, review and submission. PDF/JPEG/PNG attachments, maximum 5 MB each. Drafts survive reload. Submission locks editing until changes are requested.
- AES-256-GCM encryption for application contents and document payloads using a domain-separated key derived from the existing portal secret. Preserve that secret in backup/rotation procedures; replacing it without re-encrypting stored records prevents decryption.
- Manual Smile SmartCheck review only. Compliance reviewers record the check reference and review confirmation. No additional Smile API integration or Persona flow.
- Approval gates new app live-key issuance and backend live authorization. Existing apps are not implicitly verified or interrupted just by saving a draft. A rejection or reopening an approved application blocks live access until approval.
- Owner isolation, compliance-only document access, view/download/decision history, revision checks, replacement and removed-owner document cleanup. Document downloads are attachments with nosniff and sandbox headers.

## Verification

Passed adapter tests for developer projects, profile, product policy, CLI keys/project, sandbox boundaries, activity, operations roles/workspaces, hosted checkout and Polymarket funding. Dedicated business verification tests cover encrypted persistence, required evidence, stale writes, cross-owner access, reviewer authorization, approval and reopening. Payment tests use a temporary PostgreSQL table with rollback and cover chronology, pagination, deduplication and tenant isolation.

Real Chromium fixture tests cover the full console, three-step verification, uploads, draft/submission, key gating, reviewer decisions/history, payment statuses/search, dark mode and 320/390-pixel layouts. Fixtures never send identity documents or payment requests to providers. Screenshots are local QA artifacts.

## Operational boundaries

- Internal approval records a manual review; it does not claim that Smile or a regulator approved the business.
- Provider processing can remain pending until a provider observation is recorded. The portal does not invent completion or poll every payment provider when loading a list.
- Admin custom-domain DNS, staff invitations/grants and MFA setup remain a separate rollout. No live staff access was granted by these tests.
- Existing historical payment records without retained completion evidence cannot be truthfully backfilled by guessing.

# Pocket support parity audit

Scope: Pocket customer chat and the Pocket operations inbox. Business Support remains separate. Existing conversations and escalations are retained.

Implemented:
- Both Pocket views use the shared rounded composer, paperclip, pending file list/removal and send button. PNG/JPG/WebP/PDF/TXT: three files per message, 5 MiB each.
- File-only customer messages hand off to Pocket Support; the assistant does not claim to inspect file contents. Staff can reply with files only. Upload IDs and downloads remain authenticated and scoped to the correct user, rail, workspace and conversation.
- Bidirectional typing uses separate expiring presence records and a separate rate limit, without draft text or case mutations.
- Staff joins retain the saved profile image and private staff ID; customer responses strip that ID. Existing missing images use the shared unambiguous legacy-profile lookup. The support home uses saved team profiles instead of an unrelated portrait.
- Staff reply retries are deduplicated; newlines are preserved. Resolved cases cannot be assigned or accept attachments. Open/Resolved selection and message search now agree with their labels.
- Pocket chat uses the native API URL helper. Android downloads use the existing native document-save flow for supported support files; image previews handle native Back and release temporary URLs.

Verification:
- `scripts/pocket-support-parity-smoke.mjs`: real handlers with synthetic storage/auth tested private two-way file exchange, file-only handoff/reply, duplicate staff retry, avatar projection, identity privacy, cross-account/rail/workspace rejection, support-vs-legal permissions, presence TTL and no case mutation, closed cases, and POST-only writes.
- Existing developer support, file/presence, Pocket conversation and operations-case regression fixtures passed.
- Playwright synthetic customer/admin pages tested actual paperclip activation on both sides, file-only sends, image preview, document download, pending-file removal, both typing directions and stop, shared composer, failed-send retry without duplication, message search, resolution confirmation, disabled closed-case actions, filters and new conversations. Mobile and desktop screenshots were inspected. These are fixture tests, not live customer messages.
- Source production build and Pocket native asset build passed. The existing frontend/support typecheck baseline has no new normalized diagnostics. The expanded Pocket backend graph reports existing diagnostics in older dependencies and existing `.at` uses; it is not globally typecheck-clean.

Deployment and device evidence follow after release verification. No live customer message or file was sent by the automated checks.

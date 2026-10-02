# Hash support scope audit - 2026-10-02

## Verified current implementation

- Pocket chat authenticates the customer and binds account reads and conversations to the server-resolved identity.
- Read-only account answers precede inference. They cover saved profile name and selected outgoing Stablecoins activity, including gifts and receipt links. They are text-rule driven, not model tool calling.
- Payment reads reuse Pocket activity normalization. Funding internals are grouped; bank/bill delivery status is distinct from wallet debit. Saved records are not a fresh provider or blockchain investigation.
- 0G currently classifies eligible general questions into a built-in FAQ or approved knowledge ID. It does not generate customer answers, interpret account questions, receive conversation context, or execute tools.
- Both Pocket and Hash reject many personal, compound and transaction-specific questions before inference. This is a conservative filter, not complete anonymisation.
- Inference requests select model 0gm-1.0-35b-a3b and request private routing. This audit does not independently attest the provider enclave or retention policy.
- Model output is validated against offered IDs and approved knowledge is revalidated for workspace, version, expiry and withdrawal.
- Current persistent inference caps are 5/customer/day, 20/workspace/day and 20/global/day. They are testing caps, not a production allocation. Retries reuse reservation results.
- Unmatched questions, blocked inference, provider failures and quota exhaustion all ultimately reach the same generic handoff. This confuses understanding failures with human-required issues.
- Existing human conversations stop automated answers. Staff ownership, explicit human requests, idempotency and private account isolation are enforced.
- Live read-only verification: health 200, unauthenticated staff endpoint 401, private workspace present, zero approved/custom knowledge entries in the workspace. No messages or credentials were printed.
- Lifecycle: answered customer-inactive cases have a 24h reminder and 72h close path; staff resolution prompts use 24h. Unanswered human queues and protected payment cases are retained/escalated.
- Three-second reply presentation, reduced-motion support and receipt navigation were tested in the preceding implementation. No inference is required for animation.

## Revised scope

Hash is a guided support assistant with authenticated read-only account tools, approved product guidance and deliberate human escalation.

1. Explicit human request or a documented human-required case: explain the handoff, retain context, enter the queue.
2. Supported deterministic action or option selection: run the owned backend tool or approved guidance without model spend.
3. Unclear natural-language request: 0G may select a validated intent and missing slot from the supported catalog, using privacy-filtered language and minimal non-sensitive conversation context.
4. Backend validates every selected intent and authorizes its own customer scope. The model never supplies the authoritative account owner, destination, amount, receipt ID or payment outcome.
5. Render verified results with concise wording and real receipt/action references.
6. Ambiguity, unsupported requests, unavailable inference or exhausted credits: offer relevant option bubbles and keep free typing available. Never hand over solely because inference failed.

## Option behavior

- Default recovery: Check a payment / Gifts & requests / Account help / Talk to an agent.
- Contextual recovery: a gift question offers Gift funding / Claiming a gift / Gift refund / Talk to an agent.
- Buttons submit stable, server-validated action IDs. Labels are presentation, not a text parser contract.
- Check a payment opens an owned recent-payment selection; selection binds the conversation to that record.
- Gift funding selects owned gift activity; claiming/refund options distinguish approved instructions from an account-specific lookup. Do not imply Hash can execute a refund.
- Show only capabilities actually wired. Unknown questions receive a short clarification, not a false reason or silent queue.
- Human-required security/dispute actions remain separate from keyword-based automatic escalation. Priority does not itself prove a human action is required.
- Do not silently move existing human conversations back to AI. Preserve their history and routing.

## What 0G Compute should serve

Initial production scope: intent recognition, safe contextual follow-up resolution, and approved knowledge matching. Input privacy review precedes expanding inference beyond general questions.

Later, separately validated: plain-language explanation of sanitised verified facts and private staff-facing handoff summaries. These are not implemented today.

Never: payment execution, PIN/OTP handling, KYC decisions, refund authorization, invented transaction status, cross-customer retrieval or automatic training on chats. Names, raw identity/KYC records, secrets, wallet identifiers and financial payloads remain in authenticated backend tools by default.

Conversation persistence is private application storage. 0G Compute is inference, not automatic model learning. Existing opaque support-proof commitments are separate from conversation storage and do not constitute training memory.

## Delivery order and release checks

1. Replace automatic unknown-message handoff with structured choices. Decouple inference eligibility from the handoff boolean; otherwise changing fallback to handoff:false would accidentally disable current 0G matching.
2. Implement stable option IDs and owned record selection, retaining receipt and existing case lifecycle behavior.
3. Add explicit routing outcomes: answered / clarify / unsupported / provider unavailable / budget exhausted / human required. Measure them without logging message bodies.
4. Add privacy-reviewed 0G intent classification behind a flag. Keep validated enum output, request deduplication, timeouts and no silent provider downgrade.
5. Make budget allocations configurable with a hard global cost guard; agree limits from measured usage rather than removing them.
6. Fill the approved Pocket knowledge library and test paraphrases, multi-turn clarification, gift/request flows, provider errors, quota exhaustion, human takeover races and cross-account attempts.

Audit validation passed: conversation, lifecycle, resolution, semantic revalidation and actual handler smoke suites. Earlier live account audit passed for profile, latest payment and gift lookup. No claim of full Fin parity or end-to-end provider diagnosis.

This document revises the implementation scope. Recovery bubbles and expanded 0G intent routing are not deployed by this audit.

## Implementation update

Implemented structured recovery choices, owned recent-outgoing-payment selection, gift/request/account help menus, and explicit agent handoff. Unknown messages no longer automatically enter the human queue. Security reports requiring review retain escalation. Existing human cases remain human.

0G now has a separate business-authenticated support-intent endpoint. It receives only allowlisted vocabulary and a hasPayment boolean, selects a fixed read-only intent, and cannot supply account IDs, transaction IDs or facts. Pocket authorizes its own records after routing. Unknown or sensitive wording, unavailable compute, invalid output or quota exhaustion fall back to choices. Financial records and raw transcripts are not sent. No automatic training or generated payment explanations were added. Current cost caps were preserved.

General guidance still uses approved FAQ matching. Evidence-backed account replies remain deterministic. Cross-chain provider diagnosis, arbitrary natural language, account writes, and full Fin parity are outside this release.

Validation includes owned/forged payment selection, stable action IDs, no-queue fallback, invalid model intent, missing selected context, sensitive tokens, quota/provider failure, existing staff priority, lifecycle checks and browser choices/typing/theme/keyboard flows. Live deployment and synthetic inference results are verified separately during release.

# Deeper stale-code and environment audit � 2026-09-24

## Scope and method

Reviewed live Hash PayLink commit c17c0156a, tracked application/scripts/templates, current working-tree callers, Render setting names and configuration equality. Scanned credential fallback expressions and all cron-secret consumers. No secret values in this report; no provider revocation or fund movement. Separate PolyDesk and Hash PayStream services unchanged.

## Removed

- Four Hash PayLink Render settings: CRON_SECRET, CIRCLE_CLI_SPENDING_ENABLED, VITE_WALLETCONNECT_PROJECT_ID, VITE_ARENA_ESCROW_FACTORY_ADDRESS. Live configuration dropped from 162 to 158; all other exact values unchanged. CLI flag has no application or pinned CLI consumer, so it was not an effective spending control. Existing real agent-wallet controls remain.
- CRON_SECRET fallback in both maintenance/refund authorization paths. Valid ADMIN_SECRET verified before removal. Shared constant-time UTF-8 byte comparison; secrets accepted only in Authorization Bearer headers, never URL/body fields. Both routes fail closed when ADMIN_SECRET is absent/short. Built-in reconciliation timer remains independent of HTTP authentication.
- Unreachable daily/services/support/PolyDesk/StreamPay helper execution and media-analysis branches in api/agent-ask.ts, along with obsolete exported helpers and the retired HashWatch-assistant-only regression script. Pocket compatibility endpoint, identity, quota storage keys, payment request parsing, support routing and ZeroScout calls preserved. Over 850 lines removed from this module. No StreamPay payment/receipt code deleted.
- Unused WalletConnect setup instructions and unused Arena browser configuration from deployment/example/docs. Added ADMIN_SECRET explicitly to Render template. Fixed assistant timeout wording that incorrectly referred to payment verification.

## Retained / remaining review

- RELAYER_PRIVATE_KEY_ETH and operator provisioning idempotency settings: no current runtime consumer found, but signing/provisioning/recovery ownership must be resolved before disposal. Absence from runtime alone does not prove funds or provisioning references are disposable.
- Legacy router relayers, factory IDs and history readers: historical receipts, compatibility payment indexing and current StreamPay consumers remain; not broadly deleted.
- Dedicated PIN pepper and quote secret are present. Privy fallbacks in their source remain a separate migration-hardening task; existing hashes/signatures must not be invalidated by blanket cleanup.
- OG_MEMORY_COMMITMENT_SECRET, receipt signing/hosted-checkout signing, Paycrest webhook/API-secret fallback, governance/agent-wallet secret fallback: existing consumers found; no unverified rotation or removal.
- Smile integration remains paused rather than retired; existing data/provider keys retained.
- Three Render cron services reviewed previously: two active Hash PayStream staging receipt jobs do not use CRON_SECRET; the separate agentic-streaming report is suspended and retains its own AGENTIC_STREAMING_CRON_SECRET. No changes to these services. External cron-job.org account not verified.
- Production security branch must be carried into future releases. No full credential rotation, complete dead-code elimination, clean whole-repo typecheck, or platform readiness claim.

## Verification

Passed: admin authentication boundary fixtures (including missing configuration, obsolete cron/query/body credentials, byte-length mismatch); existing bills refund handler; reconciliation worker; Pocket-only assistant; 32 before/after assistant equivalence cases comparing full JSON responses and provider requests using mocked identities/providers, including provider failures and retired modes.

The older agent-hash-payments-parser-smoke test passes its assistant checks then fails an unchanged assertion that pending Paycrest history should be absent. The tested source includes pending before this patch; this unrelated payment-history/test mismatch remains recorded, not silently altered. No funded transactions performed.

Runtime deployment checks to be appended after release.

## Live verification � 06:08 UTC

Commit 42adb58e8bd2cb232ee49037bc606d79dfb7bf80 deployed live as dep-daqbq1qd0e5s73a126t0 after a successful fresh production build. Runtime confirms all four removed environment names absent, ADMIN_SECRET configured, and retired StreamPay assistant import absent. Loopback refund without auth returns 401; valid admin with empty body returns 400 before refund execution; reconciliation without auth returns 401. Public health, retired assistant rejection, Pocket authentication and archive input-validation checks all pass. Rollout had temporary unavailable responses while the new server started.

A separate queued developer-portal release 77f0500d57c05abc8272443958dce0a776da31c5 merges this cleanup: ancestor check passes and admin-auth, assistant, security, refunds, render.yaml and environment example are identical to the verified cleanup. That separate rollout was not initiated here.

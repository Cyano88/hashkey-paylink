# Marketplace bank execution coordination

Status: internal coordinator only, not deployed. No signer or external worker is wired.

## Changes

- Atomic worker claim with 30-second lease and random attempt/token. An expired pre-submission claim may be replaced; stale workers cannot begin submission.
- Mandatory trusted preflight adapter, absent by default, for current provider quote, holding configuration and payout authority. Exact quote consistency, maximum five-second preflight age and under-lock eligibility checks.
- Durable submission marker and unknown ledger state committed before any future external signing call. This prevents automatic reclaim or resubmission after an ambiguous crash, even when no transaction hash is known.
- Submission hash binding and uncertain outcome recording. Neither action declares settlement or releases reserved funds.

## Validation

Six fixture suites passed: bank execution, bank quotes, bank beneficiaries/preparation, wallet beneficiaries, accounting and instructions. Focused TypeScript diagnostics passed for ten marketplace files.

Execution tests cover competing claims, expired-lease replacement, stale worker tokens, absent preflight, changed holding revision or authority, stale preflight, simultaneous submission attempts, crash/restart after the durable marker, late hash acknowledgement, conflicting/reused hashes, bank revocation during preflight and preservation of reserved funds. Persistence is a serialized in-memory fixture, not a production database test. No real provider requests, signatures, broadcasts, bank payouts or UI changes occurred.

## Remaining

Implement actual preflight against approved provider and custody records, the signer/worker, submission reconciliation, definitive failure/settlement evidence and transactional notifications. A worker must reject a stale handoff rather than submitting late. Committing the marker and then crashing before signing intentionally leaves an uncertain reservation for reconciliation. No lease timeout or quote expiry alone proves funds can be released.

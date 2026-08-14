# Pocket release readiness

## Launch boundary

Pocket remains a controlled pilot until every required gate below has recorded evidence. Product availability is not proof that a money rail is production-ready.

## Implemented recovery controls

- A provider-backed worker rechecks Paycrest bank/POS orders, VTpass transactions, Circle Iris bridge messages, signed hosted checkouts and Polymarket funding status every minute.
- A protected `POST /api/admin/pocket/reconciliation/run` route provides an external cron fallback and uses the existing `CRON_SECRET` bearer token.
- Stale executions are reported after `POCKET_MAX_UNRESOLVED_AGE_MS`; `POCKET_OPERATIONS_ALERT_EMAIL` receives throttled email alerts when configured.
- Provider delays and browser closure never become synthetic failures. Unsupported or ambiguous records remain unresolved for review.
- This worker does not replace the required live recovery drills, production backup restore or daily pilot reconciliation sign-off.

## Money rails and source of truth

| Rail | Provider truth | Durable execution | Reconciliation owner |
| --- | --- | --- | --- |
| Bank payout | Paycrest order plus Base USDC transfer | Payment execution + money ledger | Paycrest status worker |
| POS settlement | Paycrest order plus Base USDC transfer | Payment execution + money ledger | Paycrest webhook/status worker |
| Bills | VTpass transaction plus verified treasury transfer | Bills intent + payment execution + money ledger | VTpass webhook/requery worker |
| Wallet bridge | Circle Iris message status | Action journal + money ledger | Circle bridge status worker |
| Wallet transfer | Confirmed chain transaction | Payment execution + money ledger | Network transaction worker |
| Hosted checkout | Confirmed recipient transfer | Hosted checkout + payment execution + money ledger | Checkout reconciliation worker |
| Service funding | Provider funding record plus chain transfer | Payment execution + money ledger | Partner-specific reconciliation worker |

## Required release gates

- Recovery: close the browser after authorization, after submission, and during provider delay; the same execution must recover without a second debit.
- Idempotency: repeat every prepare, confirm, webhook and worker call; balances and ledger events must not duplicate.
- Ledger: pagination, ownership isolation, immutable transitions and receipt references verified against PostgreSQL.
- Reconciliation: every non-terminal execution reaches terminal state or `needs_review`; no indefinite `processing` rows.
- Monitoring: alert on provider failures, reconciliation backlog, database failures, webhook backlog and unresolved execution age.
- Load: authenticated reads, checkout prepare/confirm, provider webhook bursts and reconciliation drains remain within agreed latency/error budgets.
- Backup: restore a fresh PostgreSQL instance and compare row counts, latest ledger cursor and sampled receipt references.
- Security: zero critical/high dependency findings; remaining transitive findings documented with an upgrade owner.
- Operations: transaction limits, manual-review triggers, prohibited-use escalation and support response targets approved.
- Pilot: named cohort, transaction matrix, daily reconciliation sign-off and rollback owner recorded.

## Money-movement boundaries

- Pocket sends and swaps have no Hash PayLink financial ceiling. Authentication, balance, route liquidity, chain availability, idempotency and required compliance controls still apply.
- Fixed commercial USDC checkouts reserve capacity per project across a rolling 24-hour window. The default is 500,000 USDC across supported networks; expired unpaid checkouts release their reservation.
- Paycrest-backed Naira checkout, POS and bank payout amounts are validated against a live quote for the exact requested notional. No static Pocket Naira ceiling substitutes for provider availability.
- Bills use the current VTpass service minimum/maximum, fixed variation amount and verified meter boundaries. Pocket does not impose a separate generic Bills amount or daily ceiling.
- A quote is never a completed transaction. Revalidate provider availability when creating the provider order, and never reuse a stale quote to authorize movement.

These are product and provider boundaries, not regulatory approval. Country expansion and higher-risk activity still require the applicable legal, compliance and operational review.

## Incident and recovery sequence

1. Stop only the affected rail; preserve reads, Activity and Support.
2. Capture provider reference, execution ID, transaction hash and ledger cursor.
3. Reconcile against provider/chain truth before retrying or refunding.
4. Move ambiguous executions to `needs_review`; never tell a user to submit again while status is unknown.
5. Restore from PostgreSQL backup only into a separate environment first.
6. Compare counts and sampled references, then document the recovery decision and customer impact.

## Closed-pilot evidence

For every rail, record successful, declined, expired, duplicate, provider-delayed and browser-closed cases. Run at least three real low-value transactions per supported rail and network, with a daily zero-difference reconciliation report. Public onboarding begins only after seven consecutive pilot days without an unexplained balance or ledger difference.

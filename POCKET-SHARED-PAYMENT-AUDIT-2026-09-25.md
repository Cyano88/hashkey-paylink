# Pocket payment experience audit - 2026-09-25

Scope: Pocket USDC sends, requests, bank payouts, bills, XStocks sends, XPay, scanned checkout and shared presentation. No live funds moved in verification.

## Implemented

- Shared Send/Buy/Confirm CTA: plain black, 12px corners, visible spinner only during the active operation. Shared status sheet uses Pocket typography and a solid green success icon, Done, no outside dismissal or top-right close.
- Approval/submission no longer immediately becomes a Processing result. Authoritative terminal results appear immediately; longer bank/bill/XPay/scan confirmation can hand off after a presentation deadline. That timer never decides financial state.
- Ordinary sends have owner-scoped, separate durable attempt records. Unknown outcomes do not expire after 24 hours. Activity includes pending/failed records; late callbacks cannot regress a terminal result or clear another attempt.
- Background recovery checks known EVM receipts and Solana signatures without reopening approval. Account changes invalidate late UI/recovery responses. Legacy send migration checks the linked source address.
- Bank Done detaches presentation while preserving individual payout recovery. Recovery can register a previously saved hash. Existing verified handoff, delivery and refund semantics are preserved.
- Bills retain individual owner-scoped purchase records and resume quietly. Delivery remains provider-backed; transport errors after submission do not prove failure.
- XStocks sends wait for a receipt before presenting the result. Known pending attempts remain in Activity; duplicate attempts reuse their hash. A repeated lookup timeout remains pending. Unknown signing outcomes remain protected rather than silently allowing a second payment.
- Solana signatures alone are not success. Circle confirmed state or confirmed/finalized network status is required; explicit failed receipts are terminal. Read-only status calls are bounded.
- Receipt movement labels are independent of Successful, Processing, Failed and Reversed. Requests are successful only when confirmed paid.

## Validation

Passing synthetic checks: send-attempt ledger/ownership/72-hour recovery, XStocks timeout and duplicate handling, USDC acceptance/confirmation/failure, confirmation presentation deadline/reset, unified stock Send, approval recovery, bank adapter/handoff, receipt policy, XStocks execution validation, bills navigation, Solana confirmation, and background EVM/Solana recovery with account switching. No tests signed or broadcast payments.

Shared sheet rendered in light/dark 390x844 viewport; computed Pocket font family, green success circle/white check, no Close control, ignored backdrop and working Done checked. Changed-source TypeScript check includes new files. Final build/deployment/device evidence is recorded separately in the handoff.

## Limits and remaining work

This is not certification of all live money movements. Arc swap retains its existing server-backed recovery panel and duplicate guard; it has not been converted to the new shared result sheet. XStocks trades retain the requested inline progress and sequential approval/trade guard. Their old restored pending record no longer automatically clears a fresh form, and a balance-refresh failure cannot turn a confirmed trade into Failed. Unknown wallet broadcasts must remain protected until verified; they are not safe to erase as stale UI.

Real Circle/Privy approvals, bank delivery, bill delivery and live refunds still need user-driven end-to-end checks after deployment. Do not describe a transaction hash or an elapsed UI timer as settlement proof.

## Deeper audit follow-up

Additional fixes: verified USDC success wins over a late error; editing a fresh form detaches the old attempt; recovery-session cancellation does not prove an existing payment failed; Activity can advance an ordinary transfer using terminal chain evidence without advancing request/bank/bill settlement; XPay terminal payment status cannot regress on a late submission callback; merchant recovery does not adopt a different merchant's payment; account changes after merchant authorization stop stock signing; bills block duplicate calls and stop after an account/category change while preparing approval; late bill writes cannot replace another purchase pointer. Solana receipt identity remains case-sensitive.

Added regression coverage for late failure after confirmation, editing before old confirmation, ordinary-transfer versus request Activity truth, and bills duplicate approval/account switch/provider delivery/Done. XPay API mocks verify ownership isolation, replay protection, idempotency and verified settlement. Fixed the local TypeScript audit helper to include staged as well as unstaged changed source.

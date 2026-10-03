# Pocket XPay / POS shared-sheet audit

The current agreement is in `2026-10-03-pocket-xpay-xstocks-scope.md` and supersedes the older stock-funded bank plan. Source tracing and regressions confirm one terminal/QR creator, XStocks management of existing terminals, USDC-funded bank receiving, direct enabled-stock receiving and separate receipt totals.

## Changes

- Pocket's scanner embeds `PaymentPage` for existing USDC/POS checkout. Its result already uses `PocketTransactionSheet`, and bank success requires settled delivery. Its four payment-action branches now open `PocketBottomSheet` with `PocketConfirmationDetails` and `PocketSlideAction` before invoking the existing handler. Review shows merchant, network, available fee quote and bank receiving amount. Non-Pocket hosted checkout retains its existing action.
- Direct XStocks XPay now uses the same confirmation details and action spacing. Submitted payments use `PocketPaymentSuccess` / `PocketTransactionSheet` when signing finishes, including unresolved submissions without a hash. Review and Pay are not shown on that pending result.
- Existing handlers retain approval, expiry, fee-change review, idempotency, transfer verification and bank settlement. The shared action does not request a second PIN or wallet preparation.
- Historical stock-to-bank recovery remains separate; new stock-funded bank payments remain disabled.

## Verification

- Browser checks in both themes: opening/closing POS review sends nothing; confirmation invokes one existing execution handler; no duplicate approval; pending action disabled.
- Direct stock expiry regression: expired amount refresh never pays; a higher network fee requires review; authorization executes once; unresolved submission leaves no Pay/Edit buttons.
- Existing API and browser regressions: direct XPay settlement/replay protection, unified terminal ownership, POS authentication/verification, stock-only history and exact totals, both origin rails and management restrictions.
- Shared result-sheet browser checks measure equal USDC/NVDAx heights for pending, failed and successful states.

These are source and mocked browser/API checks. No real-money stock transfer or bank payout was performed. The settlement fixture does not certify production database persistence or 0G archival.

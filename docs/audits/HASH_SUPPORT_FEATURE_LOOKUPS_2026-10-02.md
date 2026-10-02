# Pocket Support saved feature lookups - 2026-10-02

## Scope
- Requests: sender/recipient-owned records including unpaid requests; accepted is not paid. Saved payment-route state shown separately.
- Gifts: saved sent/received gift journal choices, then direct durable gift state. Owner or verified recorded claimant only. No gift service refresh, claim, refund, code, signature or secret returned.
- XPay/POS: current unified terminals owned by the user, with at most five latest saved stablecoin/bank/stock payments for the selected terminal. Merchant history stays separate from personal activity.
- Collections: owned USDC and bank collections with at most five saved contributions. Collection IDs and event IDs bound before history access. No repair/reconciliation calls.
- Shared saved-read coalescing/cache and existing chat rate limits apply. No timers, background polling, RPC scans or provider requery in these adapters. Explicit live diagnostics remain a separate existing flow.
- Only choices offered in the conversation may be selected. Follow-up status uses the server-saved feature context and rechecks ownership. No new generic personal receipt link is invented for business records.

## Verification
- Strict targeted TypeScript: zero diagnostics.
- Feature conversations: all four lists, selection, follow-up, forged choices, other accounts, human queues and failures tested. No chain/provider callbacks invoked.
- Real storage adapter tests: owner/recipient/terminal/collection isolation, contribution scoping and gift secret exclusion. Outbound network denied; zero requests.
- Existing real handler tests and prior investigation regressions passed.
- Pixel and deployed read-only provider-free audit results recorded after release.

## Boundaries
Gift drafts that exist only on a device are not listed; saved sent/received gifts are covered. This lookup targets current unified XPay terminals, not unadopted legacy standalone QRs. Lists show the five most recent choices and histories, not a complete statement or all-time total. Saved status is not live settlement confirmation. Existing explicit live checks and human review handle discrepancies. No private feature records are sent to inference.

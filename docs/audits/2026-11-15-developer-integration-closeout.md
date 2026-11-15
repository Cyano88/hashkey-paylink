# Developer integration closeout - 2026-11-15

## Changes

- The portal's copyable create-checkout snippet now forwards the saved order currency. Nigerian Business orders retain their NGN catalog price; checkout quotes the stablecoin payment separately.
- Getting-started and receipt documentation now describe automatic eligible customer receipts, separately opt-in daily/weekly owner summaries, and audience-specific receipt data. Removed stale receipt opt-in and X Layer-only guidance.
- Clarified that the merchant's net bank settlement can differ from the customer's order price after quoted merchant-paid charges. Fulfillment uses verified payment/order matching.

## Verification

- Source production build passed (existing large-chunk warnings).
- Builder integration and webhook-contract smoke tests passed.
- Browser guide smoke passed across 21 documentation pages, mobile/desktop layouts, and light/dark themes. The rendered portal snippet was executed with mocked fetch for both NGN and stablecoin orders to check amount, currency, selection, and idempotency.
- Read-only production verification of the existing Lunchroom payment passed through the copyable status helper: saved Base/USDC route, NGN settlement, NGN 2103.26 order, exact 1.500004 USDC receipt, matched parent/child checkout, one delivered confirmation event, and receiver record.
- Updated a stale browser-test policy assertion to match the existing separation of business review, saved settings, and route activation.

No new transaction or email was sent. No native, payment-processing, receipt-rendering, summary-setting, or public route-gate changes were made. Existing Lunchroom evidence verifies this integration path; it does not certify every payment rail or public activation.

## Deployment

Commit `2ffd49756117f0aa6ac5d406c7e1901642bd64ed` deployed as `dep-dbsrgk6i0phs73dup7rg`, live at 2026-11-15T13:54:13.42177Z. After reloading the authenticated developer dashboard, targeted Playwright checks confirmed the published snippet forwards currency. The live getting-started page passed checks for automatic receipts, separate summaries, and net NGN settlement. No credentials were printed. A transient browser timeout during the service switch cleared after the deployment became live.

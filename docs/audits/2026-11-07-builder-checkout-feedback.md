# Builder checkout feedback — 7 November 2026

Reviewed the four WhatsApp screenshots in Documents dated 7 November, alongside the live AlveronFashion project and expired order 37/40 checkout records.

## Verified causes and changes

- The ready AlveronFashion project had BNB receiving settings and USDC/USDT configured, but was absent from the production BNB project allowlist. Configuration and activation now have a shared server-side definition, visible in developer and operations portals. Production activation must be applied separately for this project, preserving existing entries.
- Selecting a Circle route previously reduced the child checkout to one network. New same-asset USDC-settlement children retain other eligible Circle networks from the signed parent snapshot, requiring current acceptance and the same recipient. One checkout/attempt and the existing pre-submission network lock remain. BNB/XLayer and NGN settlement retain their existing boundaries.
- Merchant-paid fee refreshes compared the merchant's changing net receipt, even when the buyer's total was unchanged. Review now remains required for changed buyer debit; merchant-paid recipient-only differences no longer loop the buyer. Signed quotes and transfer verification remain mandatory.
- Browser checkout waits for authentication restoration and uses client-side navigation for its alternate continuation link.
- Web send can restore an owner/device-bound renewable Circle session after verifying the backend-linked wallet. An explicit Reconnect wallet action recovers the session while retaining recipient and amount, then prepares review without submitting a transfer.

## Validation

- Production source build passed.
- Scoped TypeScript check covering changed frontend and backend dependencies passed; frontend-only repeat also passed.
- Passed fee review, network policy, rollout policy, checkout selection, hosted adapter, BNB, XLayer, merchant fees, return flow, wallet recovery, Circle session, checkout card, selection browser, optional-wallet portal, send sheet and send preparation suites.
- Developer console browser suite passed after starting its preview and isolating the real signing SDK from synthetic fixtures.
- BNB settings browser regression passed: saved configuration remains visibly pending until server activation; editing assets does not imply activation.
- Withdrawal recovery browser test verifies retained recipient/amount and zero transfer submissions.

## Scope and release verification

No funded payment was signed or broadcast during these checks. This is not evidence of a completed live checkout payment. Existing expired checkout records remain expired; the builder needs a fresh checkout for new network options. Same-asset Circle switching is supported before payment locks the network; changing an already-selected checkout across Circle and BNB/XLayer is not implemented by this patch. The intermittent Continue failure was not independently reproduced as a network outage; session recovery addresses the observed recovery gap without claiming to eliminate external network failures.

## Live verification

- Render deployment `dep-dbnie715efls73be8f4g` is live at `a267e26c667a87b5291ee0b5564183f2154c7ffb`.
- The existing BNB project allowlist was preserved and the ready builder project was added. A read-only check inside the deployed service resolved its current policy and confirmed BNB enabled with both USDC and USDT.
- Public health checks passed on app.hashpaylink.com and hashpaylink.com, including healthy database state and zero unresolved/stale Pocket jobs. The first request during startup returned 502; subsequent checks passed after startup completed.
- The deployed frontend entry asset returned HTTP 200. A builder retest with a fresh order and a funded payment remains outstanding; automated fixtures and healthy service status do not establish payment completion.

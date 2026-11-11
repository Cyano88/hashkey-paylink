# Receipt audiences and business summaries

Recovered owner direction: on 10 November at 06:35 UTC, the owner preferred a daily batch summary for developers. The follow-up explicitly retained individual buyer/seller settlement receipts. On 11 November the owner requested a careful review of payer, marketplace, seller/merchant, and withdrawal views. Daily/weekly reporting must not replace proof of an individual payment, refund, or completed withdrawal.

| Viewer | Individual record | Email/reporting policy | Amounts belonging to this viewer |
|---|---|---|---|
| Buyer/payer | Payment and refund receipts | Verified purchaser email after confirmed payment; refund receipt after final refund | Order amount, fees actually paid by buyer, total paid; full refund received and any buyer deduction (currently zero) |
| Ordinary Checkout merchant | Incoming payment and settlement records | Daily sales summary, weekly option; no copy of each buyer receipt | Gross sales, merchant-paid fees, net proceeds, settlement currency separately |
| Marketplace operator | Project-level collections, allocations, releases, refunds, withdrawals | Daily business summary, weekly option; API/webhooks retain transaction-level events | Collected principal, seller allocations and platform allocations separately, liabilities and completed movements; platform allocation revenue is not the Hash PayLink withdrawal commission |
| Marketplace seller | Own sales allocations/balance and completed wallet/bank withdrawal receipts | Own sales summary; completed withdrawals still receive an individual receipt | Own allocations and balances only; net received, commission/provider/network costs, and exact total balance debit |

Rules:

- Server-verified identity and project/seller scope determine recipients. A project owner's mailbox is never a fallback for an unidentified payer or seller.
- Bank-account masking is display information, not an ownership proof. Bank history requires the current unambiguous seller identity link for the same project and seller.
- Shared/emailed payer receipts must not turn into marketplace/seller views. Recipient views must not inherit payer-only fee breakdowns.
- Keep USDC/USDT, chain-specific amounts and local-currency settlements separate. Do not add NGN receipts to USDC sales or treat a pending allocation as a completed payout.
- Summaries are statements of a period, not new payment receipts. Preserve individual transaction/reference IDs and original confirmation timestamps.
- Daily is the preferred reporting cadence; weekly must be an explicit preference. Summary enrollment, timezone, first period, no-activity behavior, retries and historical cutoff must be visible and tested before activating delivery.
- Current individual receipts remain available in Activity/API; summarizing emails must not delete those records or weaken webhook-based fulfillment.

## Confirmed gaps and work in progress

1. Lost checkout-confirm responses left a paid native sheet Processing. Fixed and installed on Pixel; same transaction recovered without another charge.
2. Reopened paid checkout used shortened receipt ID, producing a fallback timestamp/name. Full signed reference now hydrates the original receipt; actual Pixel showed the original 13:26 time and marketplace name.
3. Native receipt rendering lacked the Marketplace payer-fee and withdrawal-fee fields present in the backend/web renderer. Bounded parity changes are in the original native source; parity fixtures pass. A final native build/install remains necessary after the audience audit.
4. Checkout activity dropped payer-fee evidence. New projection and validation retain it only for the outgoing payer; total paid and exact treasury-leg deduplication have regression coverage.
5. Seller bank payouts were absent from the wallet-only Marketplace activity lookup. New project/seller identity-scoped projection has wrong-owner, wrong-project, revoked and ambiguous-link regressions.
6. Wallet payout Activity receipts omitted total balance debit. Added alongside net received and withdrawal fee.
7. Business summaries were previously discussed but not implemented. Do not describe them as live until scheduler, scoped recipients, preferences and delivery checks pass.

No new payment, payout, live receipt email or summary has been sent as part of this audit. Do not count local fixtures as live acceptance. The existing bank-payout/gas-coverage and webhook-configuration acceptance items remain open separately.

## Implemented and checked on 11 November

- Payer receipt and outgoing Activity retain verified buyer-paid fees and total paid. Incoming merchant records use their own net/fee evidence. Split on-chain fee legs are deduplicated using exact transaction, addresses, asset and amounts; unrelated transfers remain visible.
- Public/shared payer receipts and newly prepared buyer emails omit merchant net-settlement accounting. `Paid to` displays the actual business/marketplace name without guessing its role from a fee policy. Historical frozen emailed PDFs remain immutable.
- Seller wallet withdrawals show net received, withdrawal fee and total balance debit. Seller bank history requires one current project/seller identity link and displays NGN received separately from USDC debited, commission, provider and network fees. Refund receipts show the amount received and zero buyer deduction; internal marketplace gas funding belongs in the business summary.
- Summary delivery is implemented for ordinary Checkout project owners, marketplace project owners and individually enrolled sellers. Daily is the suggested cadence; weekly covers Monday through Sunday. Enrollment defaults off and binds the authenticated subscriber on the server. It never uses an app owner's email as a payer/seller fallback.
- Reports use closed calendar periods in the saved IANA timezone, with a 15-minute close grace. The first period starts at enrollment; frequency/timezone changes start a new enrollment period. Empty periods are skipped. Outages catch up one period per candidate per worker tick.
- Checkout activity is recognized on its first durable verified payment observation, or first final local-settlement observation. This includes late reconciliation without counting validated and settled twice. Missing required canonical proof defers the period rather than emailing partial totals. Marketplace collection finality, allocations, refunds and withdrawals come from canonical accounting evidence. Current balances are explicitly a generation-time snapshot, not a fabricated historical closing balance. Assets and networks remain separate.
- Operator statements separate customer principal, seller allocations, platform earnings, refund gas and withdrawal costs. Seller statements contain only their own allocations, balances, refunds and withdrawals. Platform allocation earnings are not Hash PayLink's withdrawal commission.
- The existing durable leased email outbox provides dedupe and bounded retries. Summary scope, enrollment epoch, owner, seller link, opt-in and current verified email are checked again before sending. Transfer, revocation, ambiguity, suspension, opt-out and email change prevent delivery to the old recipient. No one was automatically enrolled and no live email was sent during testing.

Validation: summary preference/timezone/DST/catch-up tests; scoped accounting report tests; guarded delivery, crash/deduplication and no-activity tests; seller-session authorization tests; payer/merchant receipt isolation and eight-network activity tests; native/web receipt parity; native source guard; browser receipt and summary settings at 320/390/1280 widths in light/dark; PDF rendering and visual inspection. Test outboxes only. Full source build and native build outcomes are recorded with the final release handoff.

Pixel evidence: the installed receipt showed the original 11 November 13:26 payment time, correct marketplace name, order 0.05 USDC, processing 0.000125 USDC, collection network fee 0.004393 USDC and total paid 0.054518 USDC. Screenshot `output/playwright/pixel-receipt-details.png`. The success sheet was subsequently changed to use this same verified total; no repeat transaction is part of recovery.

The earlier recovery deployment `dep-dbq64umk1f9s73dni0l0` is confirmed live at source `1dba7d8a396ac764a9a7adb6e629b59a4ab49baf`. This does not establish deployment of the broader receipt/summary patch; verify its own final commit and deployment separately.

## Release verification

Web/backend source `e95c8f933e6bc384062f2941544bfeaa2e151d49` is live in Render deployment `dep-dbq7ig2fngtc73cthrug`, confirmed 11 November 2026 at 14:24:20 UTC. Includes receipt audiences, scoped summaries, local-currency proceeds separation, full signed-reference recovery and the shared success-sheet total fix. Public checkout/receipt read-back confirmed the existing transaction, original timestamp, 0.05 USDC principal and 0.054518 USDC total; merchant accounting fields are excluded.

Native source remains `C:\Users\USER\pocket-play-update-20261101`. Final native build, Capacitor sync, Gradle, data-preserving APK installation and lineage guard passed. APK SHA256: `6C08E9AC5A5F207E303868F0EFF43E7EA641C6346D3C0C7A0F1915D3487325CB`. Browser regressions prove exact success-sheet/receipt total parity at 320/390 in both themes. The prior installed detailed receipt was visually verified on the actual Pixel. Final post-install Pixel session restoration is being rechecked separately; do not substitute fixture success for live device acceptance.

No live email was sent by testing, no summary subscriber was enrolled, and no new payment/payout was submitted. The 0.3% withdrawal commission and execution gates are unchanged. Marketplace bank finality/gas coverage and developer portal/webhook end-to-end acceptance are still separate outstanding work.

Final device check limitation: after the last install and one data-preserving app restart, the Pixel remains at Connecting securely. Read-only WebView resource timings show repeated `auth.privy.io/api/v1/sessions` requests timing out at about 20 seconds and embedded-wallet requests failing before an HTTP response. Local assets and Privy public app configuration load. No authentication configuration, tokens, stored app data or payment state were altered to bypass this. The final success-sheet override fix is built, installed and browser-regression verified; its final on-device display remains to be rechecked once session restoration succeeds. The actual detailed payer receipt was verified before this final reinstall, and the live API remains confirmed against the original transaction.

## Pixel acceptance and portal read-back - 11 November follow-up

Reopening the existing paid checkout exposed an interim presentation gap: before the canonical signed receipt arrived, the success sheet showed the 0.05 USDC principal and offered a locally constructed fallback receipt. Hosted Pocket payments now retain verified success but suppress the amount and receipt action while the canonical receipt loads. Done remains available; no local fallback receipt is fabricated for hosted payments. Non-hosted receipt paths are unchanged.

Both web and original-native component regressions passed at 320/390 pixels in light/dark, including deliberately delayed receipts, hidden interim principal, enabled dismissal and canonical total/fee presentation. Scoped checkout TypeScript diagnostics passed apart from the separately known native BrowserCheckoutCard resetEmail mismatch. Web and native builds, Capacitor sync and Gradle passed. Native APK installed preserving data: SHA256 E2E06FFAB12628BD32CE7C6033A760B9F6061A2FE0884319564C467DCC892A18. It retains the native Privy session transport fix.

On the physical Pixel, the original checkout reopened as Successful, displayed 0.054518 USDC, opened its canonical receipt with 11 November 13:26 original timestamp, 0.05 principal, 0.000125 processing fee and 0.004393 network fee. Back returned to success; Done dismissed the sheet and returned to Pocket home. No repeat payment was submitted. Live API read-back confirmed the same transaction and absence of merchant accounting fields. Seller bank-receipt isolation and guarded summary-delivery regressions passed; test outboxes only.

Current bank acceptance prerequisites were re-read, not inferred from old notes: 1 USDC released, 0.05 USDC finalized but still pending business release, zero reservations/payouts. The 0.3% commission remains. Gas-coverage evidence is absent; payout, bank worker and Marketplace webhook worker gates are off. The internal Marketplace test app has no webhook destination. Do not silently release held balances, invent gas-policy evidence, enable workers or claim bank arrival. A fresh accepted quote is required after the release/gas prerequisites, before any funded canary.

Developer portal integration read-back: Lunchroom is active, has one active key, a configured HTTPS webhook and configured receiver secret, with seven recorded accepted webhook events. Its current saved settlement is NGN. The existing paid order chks_cf380f77bc6344a9aba62071 was independently checked with the project's authenticated status API: paid, Base, USDC settlement for that historical order, selected checkout chk_61c5a7f25feb4ef0b913. Its stored receipt resolves HTTP 200, confirmed, amount 1.500004 USDC. Historical USDC acceptance must not be represented as a new NGN-settlement acceptance under current settings.

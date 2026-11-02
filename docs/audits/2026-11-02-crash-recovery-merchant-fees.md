# Crash recovery and merchant fee continuation ? 2026-11-02

## Verified recovery

- Exact interrupted session: `01a1990a-76a1-7542-859d-29dc9628ce92`, `.codex/sessions/2026/11/01/rollout-2026-11-01T22-36-02-01a1990a-76a1-7542-859d-29dc9628ce92.jsonl`. Last recorded command completed 10:54:01 UTC.
- Active backend/web checkout: `C:/Users/USER/hashpaylink-checkout-release-20261102`, branch `fix/native-links-20261102`, recovered HEAD `efbe205c781c66004f54fae2b7ceaa88206808e2`, origin `Cyano88/hashkey-paylink`.
- Receipt release verified live in Render: `dep-dbk6hmlg1s2s739etgf0`, commit `efbe205c7`. Production health returned healthy with zero unresolved/stale executions. Automatic receipts require a verified customer email and verified payment/local payout, with no merchant opt-out. No historical email backfill claimed.
- Earlier payment classification/notification release `a7d8b2d91` is included. Prior session verified the Pixel's AlveronFashion Base purchase as Web payment with canonical receipt. This recovery did not make a new funded payment.
- Native source is exclusively `C:/Users/USER/pocket-play-update-20261101`. Pixel serial `5A160DLCH006VM` was rechecked: installed 1.0.8, versionCode 9. Preserve original lineage, artwork, Cash/Earn, bridge/swap recovery and existing account. No native builds from the web repo.

## Decisions retained

- Customer pays the product/order total; merchant pays 0.25% plus network reimbursement from proceeds. Merchant controls product price, not Hash PayLink's platform fee.
- User clarified during recovery: show one combined **Fee**, not separate service/network fee lines. Retain breakdown internally for verification/accounting; merchant can see net proceeds.
- Public checkout opens in browser; explicit Pocket handoff opens Review payment, not the camera. Keep payment-method selection and Back behavior.
- Receipts automatic for eligible customers; support address/timezone remain configurable.
- XPay is current; retired POS UI/products must not return. Internal compatibility identifiers/history remain.
- Next stage explicitly requested: perfect bridge and swap after this checkout/receipt/fee stage. Do not start that stage prematurely.
- Earlier cost/event work is retained: X Layer indexed native discovery with canonical proofs/fallback, telemetry and wallet event recovery; user confirmed BNB USDT and later Base USDC pushes. Do not require more funded tests when user has no assets.
- Deferred continuity item: Zivah developer-portal identity/KYC sharing with Pocket. Broader treasury/security audit and retired Arena remain outside this release.

## Continuation fixes (local until rollout verified)

- Fixed interrupted TypeScript fee proof and duplicate activity schema definitions.
- Restored fee-test isolation after ng-pos dependency addition; tested existing legacy Solana registration separately.
- Exact merchant split treasury transfer no longer appears as an additional customer send; unrelated transfers remain visible.
- Propagate merchant fee evidence to receipts and merchant net activity/history; developer Activity shows total, one Fee, net proceeds.
- Paycrest v2 budget requires exact providerAccount.amountToTransfer, source currency/network/refund, and destination bank binding. Reject changed funding instruction before customer payment. Docs verified: https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2 . No real provider orders created by recovery tests.
- Solana gross/net quote crossover is rejected; merchant debit is exact order total. Pause guard is exercised with isolated durable state, never bypassed in production.
- X Layer merchant split expanded to USDC/USDT/USDe/USDG, retaining integer precision and personal-send separation. Both merchant and treasury transfers required.
- Native edits applied selectively, not by replacing divergent wallet files. Pre-edit backup: `.codex-temp/native-before-merchant-fees.zip`. Original native source baseline retained; allowlist records explicitly reviewed checkout-related files.

## Validation status

- Passing targeted fixtures: receipt settings and delivery/reconciliation/PDF/rail tests; BNB service/settlement; shared merchant fee proofs; fixed provider budget; Paycrest fee-payer integration; Solana payment fees including emergency pause; legacy XPay Solana receipts; activity adapter/grouping; developer status; all four X Layer reimbursement/client/settlement proofs.
- Full web TypeScript passed including all-four-asset changes (`.codex-temp/merchant-fees-typecheck.log`). Production source build passed; final small presentation edits also undergo incremental typecheck and deployment build.
- Browser fixtures passed: native launch link consumed once, Back/warm links, checkout review/retry without camera or payment writes, hosted choice light/dark, and web card at 320/390/1280 widths with funding, cancellation and duplicate-tap protection.
- Native full TypeScript is not clean: errors remain in the older native source (Arc, StreamPay, bridge typing, BrowserCheckoutCard props and ES2020 library declarations). The added Object.hasOwn use was replaced with an ES2020-compatible own-property check. Do not report native full typecheck as passing.
- Native verification now uses the signed quote recipient amount. Solana activity was checked separately: it projects the owner's total token balance delta, rather than separate treasury legs.
- Native source guard and initial Vite native build passed. Final build, same-signer APK, device review, deployment and live checks remain to be recorded below.
- Do not treat synthetic proofs or a source build as live-payment evidence.

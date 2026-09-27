# Unified XPay implementation checkpoint

Updated 2026-09-27. Feature branch: feature/unified-xpay-20260927.
Not deployed and not production-complete. Pixel retains its existing stable build.

## Confirmed scope

The user explicitly chose BOTH direct Base USDC bank payments and stock-funded bank payments, alongside direct merchant wallet payments. Stock-funded bank payments must convert through the payer's Privy wallet, bridge native USDC to Base, and then fund the existing bank payout rail. Circle and Privy ownership/signing remain separate.

## Implemented in this draft

- Shared reusable QR and destination discovery from existing POS and XStocks merchants; existing QR paths remain compatible.
- Up to three unique accepted assets, counting USDC once across destinations.
- Inline bank/mobile-money setup using the existing Pocket POS form and bank-name gate; inline wallet asset search using the canonical stock catalog.
- Idempotent merchant creation and safe retry when destination refresh fails after creation.
- Public destination selection, canonical asset images, downloadable QR, PIN-protected deletion.
- Shared QR ID propagated through native scans and web checkout to bank intents, stock payment attempts and verified stablecoin receipts.
- Merchant-only, per-QR history, grouped by date, with existing Pocket receipt/status presentation and quiet refresh.
- Revision/deletion checks on new bank orders and stock authorization. Submitted payment settlement and history survive QR deletion.
- Merchant bank history reports success on bank settlement, not merely a source transfer hash.

## Verified

- Shared QR API tests: ownership, replay, asset limit, public privacy, changed destinations, protected deletion, per-QR history isolation.
- Stock payment API tests: setup replay, checkout binding, revision/deletion guards, verified settlement and submitted-payment recovery.
- Browser tests: inline setup, failed parent refresh retry, shared USDC counting, fourth-asset rejection, QR creation/history, public selection and actual stock-image loading.
- Receipt TypeScript regression corrected. Full repository type check has pre-existing errors; do not claim a clean baseline.
- Pocket mobile build passed earlier in this session; edits since that build require a fresh final build.

## Required before rollout

- Implement stock-funded bank execution: server-bound fee-inclusive quote, Privy swap, X Layer burn, attestation, Base mint/arrival proof, then existing Paycrest funding. Preserve source funds and allow recovery after quote expiry or interruption; never repeat a swap/burn on an ambiguous result.
- Persist and reconcile every conversion/bridge/payout step with one coherent activity record and truthful receipts.
- Audit stablecoin wallet attribution replay (an existing untagged receipt is not automatically reassigned to a QR) and archive metadata coverage.
- Validate the complete new payment paths end to end and visually on device in both themes, then rebuild and update Pixel in place.
- Current reusable QR uses payer-entered amounts. Fixed-amount creation is not implemented.

## Provider constraint verified 2026-09-27

https://developers.circle.com/cctp/concepts/supported-chains-and-domains
X Layer is domain 37 and supports standard/fast CCTP, but lacks source upfront fees and destination forwarding. Base supports forwarding; source upfront-fee availability must not be conflated with destination forwarding. Existing Pocket bridge assumes Circle-owned wallets and upfront forwarding fees, so simply adding X Layer to its enum is insufficient.

https://developers.circle.com/cctp/references/contract-addresses
X Layer TokenMessengerV2: 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d.
Pocket's stockUsdc is native X Layer USDC. No real swap, bridge or new payment was sent for this draft.
## Progress UI follow-up

- Added compact XPay progress inside the existing confirmation sheet. The CTA retains its Pay label while busy.
- Current direct stock payments show only Confirming payment after a transaction hash exists, including restored submissions. Authorization alone never activates that stage.
- Submitted payments cannot be edited or resubmitted from the sheet.
- Shared progress supports optional Swapping and Bridging stages; these are not exposed as functioning routes until the execution/recovery integration above is complete.
- Tests cover skipped stages, proof ordering, failure, no premature completion, and approval/submission guards. No Pixel deployment in this checkpoint.
- Recovery presentation now includes Retry and mapped, muted failure guidance, including insufficient OKB and expired quotes. Duplicate clicks are locked.
- Retry policy distinguishes swap, source burn and destination mint. Confirmed burn permits only mint recovery; ambiguous outcomes do not permit resubmission. This policy/component is tested but still requires the stock-to-bank execution controller to supply authoritative state and callbacks.
- Added pocket-xpay-progress-smoke and pocket-xpay-progress-browser-smoke. Existing XPay expiry/approval browser checks pass with no pre-broadcast confirmation progress.
## Bridge backend checkpoint

- Dedicated X Layer domain 37 to Base domain 6 CCTP provider added. Live public fee lookup returned fast and standard quotes; fee calculation uses integer arithmetic and reserves the maximum protocol fee above the required Base arrival amount.
- Strict message validation binds source/destination wallets, native USDC, network domains, TokenMessenger, amount, fee cap, finality and nonce. Base arrival requires the CCTP V2 MessageReceived event plus the matching native-USDC mint.
- Internal bridge coordinator verifies Privy source ownership and the linked Base destination, checks OKB, records authorization before burn data is released, recovers lost burn hashes using bounded event scans, and verifies canonical source receipts.
- Durable journal protects owner isolation, concurrent authorization, immutable hashes, source-burn replay and terminal state. Mint requests retain the same Circle idempotency key after a lost response; a confirmed mint failure resumes minting only. Expired attestations can request re-attestation without another burn.
- Circle challenge reader generalized by EVM chain, preserving the existing Arc wrapper. Base mint uses the existing sponsored Circle contract execution helper and simulates the attested receiveMessage call before a new approval request.
- New tests: pocket-xpay-cctp-smoke, pocket-xpay-bridge-journal-smoke, pocket-xpay-bridge-service-smoke. All pass. Existing Circle EVM Gas Station and Arc swap smoke tests pass. Bridge service dependency bundle passes.

Still not deployed: bridge service is internal only, with no public route enabled. The full XPay coordinator must bind the shared checkout, approved stock swap, fee-inclusive amount, bridge record and Paycrest funding attempt, expose authenticated operations and connect the progress UI. Signed-wallet/device end-to-end validation is still required. No real swap, burn or mint was submitted in this checkpoint.

Additional references checked:
https://developers.circle.com/cctp/references/technical-guide
https://raw.githubusercontent.com/circlefin/evm-cctp-contracts/master/src/v2/MessageTransmitterV2.sol
Use the V2 bytes32 nonce event from the contract source; do not use the legacy uint64 MessageReceived event shown elsewhere in the docs.

## Stock-funded bank coordinator checkpoint — 2026-09-27

Implemented locally:
- Canonical Paycrest payout adapter uses its exact fee-inclusive funding amount and refuses fee configuration drift from the 0.25% platform fee. No second transfer fee is added. This is code validation, not live Render configuration verification.
- Stock funding estimates use integer arithmetic; executable OKX minimum output must cover the bridge burn. Receipt proof binds the exact approved transaction, native USDC net arrival and maximum stock input.
- Owner-scoped durable bank coordinator connects approval, stock conversion, CCTP bridge, verified Base arrival and the existing Circle-sponsored bank funding transfer. Pending/unknown submissions cannot start another payment or repeat a completed stage.
- Authenticated API handler added in api/pocket/xpay-bank.ts, but deliberately NOT registered in server.ts. It filters private journal fields, accepts PIN approval only from the existing approval header, keeps Circle sessions ephemeral and serializes signing amounts safely.
- Quote refresh before a burn cannot increase the approved fee or amount. Expired Paycrest quotes can be explicitly re-reviewed and PIN-approved without repeating conversion/bridge, provided the replacement funding amount does not exceed the previous quote. More expensive replacement quotes remain blocked with funds retained in the user's wallet.
- Lost payout responses reuse the same Circle idempotency key. Broadcast hashes are persisted separately from success; approval/challenge creation never activates the Confirming payment progress stage.
- Fixed a mint concurrency risk: atomically freeze attestation and idempotency key before deriving calldata; persist successful simulation before requesting Circle approval. Pre-request simulation errors release the unvalidated claim for safe recovery. Lost external responses keep the validated request unchanged.
- OKB preflight now applies to bridge allowance approvals as well as burns.

Validation:
- Ten focused smoke suites pass: CCTP provider, bridge journal, bridge service, bank journal, bank coordinator, payout adapter, stock funding proof, API privacy/authentication, bank progress and existing progress/retry policy.
- Focused TypeScript semantic/syntax diagnostics for the new/changed coordinator, adapter, journal, provider, handler and progress files: zero. Full repository compilation is not asserted clean.
- All execution tests used isolated fixtures. No real swap, bridge, mint or payout was submitted. No deployment or Pixel installation occurred.

Remaining before rollout:
- Connect existing asset-selector and confirmation sheet to the handler, Privy signing and Circle mint/payment approvals. Register the route with separate read/write request limits only after those recovery paths are tested.
- Drive compact progress and Retry from authoritative snapshots, including re-attestation and quote re-review. Handle wallet cancellation/unknown submission without replay.
- One payer activity/receipt record across swap, burn, mint and payout; reconcile later provider settlement/refund into that record. The new bank journal is not yet connected to payer Activity.
- Review recovery for a more expensive expired payout quote and canonical reverted payout broadcasts; neither may silently restart an earlier stage. Current behavior preserves funds and blocks further spending.
- Complete mobile/web visual and signed-wallet end-to-end validation, then deploy and update Pixel in place while preserving app data.

## Checkout and activity checkpoint - 2026-09-27

Implemented locally (supersedes the preceding unregistered-route checkpoint):
- Registered authenticated /api/pocket/xpay/bank with separate read/write limits. Existing picker, confirmation sheet, PIN, hidden Privy signing and Circle approvals drive the bank route.
- Progress follows verified swap, bridge and payout evidence. Low OKB returns Retry; no payment Processing state merely because Circle approval opened. A 90-second foreground window allows later continuation through Activity.
- Activity records one XPay payment and suppresses only verified intermediate conversion hashes, including cached copies. Original asset/amount and bank delivery remain distinct. Refunding/refunded updates stay on that payment. Incoming refund-transfer deduplication is not yet proven because the existing provider model does not expose its canonical return hash.
- Resume uses owner-authenticated payment ID, including after the merchant deletes the public QR. Saved source hashes reconcile before further signing; no unknown outcome silently resubmits.
- Live service env inspection found PAYCREST_SENDER_FEE_PERCENT absent. Removed that draft requirement. Shared-XPay intents now request 0.25% and the existing EVM treasury explicitly per Paycrest V2 order; returned percentage and token fee are validated. Other order types retain their current configuration. Exact provider funding amount is used once, with no duplicate treasury transfer.
- Public provider reference: https://docs.paycrest.io/api-reference/sender/initiate-payment-order-v2 (senderFeePercent and senderFeeAddress).

Validation: fixture browser checkout and focused API, client-binding, coordinator, journal, activity, payout and fee suites pass. Source-proof recovery tests protect unrelated attempts; refunded cannot regress to settled. Mobile build passed before the final activity/fee changes; a final release build is still required. Tests use mocked signers/providers, not real funds.

Release state: source not yet deployed or installed. Production currently includes e077de5b7 and Circle CLI 1.1.4 signing changes which must be retained. More expensive replacement quotes and canonically reverted payout broadcasts remain conservative recovery stops; do not claim complete money-moving production validation until a supervised signed-wallet test passes.

## Released checkpoint - 2026-09-27

- Render service srv-d7ilg0osfn5c73eaedf0: final deploy dep-dasepd2bk1rc739hrcm0 is LIVE at e90db1abb97aa21eac2e3872b21a35bec84c3691 on security/production-cleanup-20260924. Production Circle CLI 1.1.4 changes were merged and both patches checked against the exact published package without mutating shared local node_modules.
- Pixel 5A160DLCH006VM updated with adb install -r. Package com.hashpaylink.pocket, version 1.0.3. Original firstInstallTime remained 2026-08-16 04:36:02; lastUpdateTime 2026-09-27 11:22:11. No uninstall or data clear.
- Final APK: android/app/build/outputs/apk/debug/app-debug.apk; SHA256 DA1778F90DE3291CE8495569F9B535C36FB8EE63DF2FAC9700A965F1B0527DC4.
- Initial device check caught missing ignored google-services.json in this isolated checkout. Restored the existing production mobile configuration, rebuilt and reinstalled. Final process 19953 remained alive and had zero AndroidRuntime fatal exceptions. Added native build preflight requiring the correct Firebase package before building. Configuration remains ignored, not committed. This build-preflight change is in the feature branch; it does not require another server deployment.
- Final native web build succeeded; Gradle final repair build succeeded. Native assets include the final refund wording. Generated dist/Capacitor path diffs were restored after packaging.
- Live POST /api/pocket/xpay/bank list and approve probes without authentication return JSON 401, not HTML or payment execution. These are boundary checks, not provider execution tests.
- Merchant history now excludes unfunded/expired replacement quotes but retains funded failures and refunds. Provider fee validation accepts precise decimal quotes within one USDC base unit of rounding; missing, excessive or redirected fees fail before funds move.
- No real swap, bridge, mint or payout was submitted. Supervised signed-wallet end-to-end testing is still required. Remaining conservative recovery limitations from the previous checkpoint still apply.

## Navigation and list audit - 2026-09-27

- Preserve explicit stablecoins/XStocks entry origin through shared XPay, scanning, wallet QR management, bank QR management and payment recovery. Header Back and native Android Back unwind local steps before returning to the entry section. Sheets retain priority and busy operations remain protected.
- Wallet asset editing returns to the selected QR; linked wallet/bank lists return to shared XPay. Resume returns to its originating activity/home route using an internal-path allowlist.
- Added optional per-view scroll keys to the existing RouteShell. Store last observed scroll positions before short-content layout clamps them; restore before paint. QR/detail/create/history no longer share one scroll position.
- Accepted-assets setup uses one flex-sized list scroller. Header/search/Continue remain visible, including keyboard-sized viewports. QR rows and payment choices reuse the established Send-list spacing, circular icon container, chevron and divider treatment.
- Pull refresh calls XPay's own lists and keeps existing rows visible. It is disabled on setup/payment forms. Existing RouteShell callers retain default refresh behavior.
- Focused TypeScript diagnostics zero. Navigation browser regression passes both entry rails, light/dark, 390x844 and 390x540, header/native Back, modal priority, edit-to-QR return, long-list scroll restoration and visible CTA. Existing asset selection/retry fixture also passes. Internal target allowlist unit test passes.
- Native web build and Gradle assembleDebug pass. Pixel 5A160DLCH006VM updated via install -r, lastUpdateTime 2026-09-27 11:51:32; original firstInstallTime retained. Process 13555 alive with zero native fatal exceptions after launch. No financial action taken.
- APK SHA256 EBC5CC68DE38755C27798C174A35657E65896D0A608FB471F3C463248B693BF3. Release source 9cf4f2b4320c15539498fa65004a085fd54d733f. Render deploy dep-dasf9jjtqb8s739n6f3g was building when this checkpoint was written; verify final status below.


## 2026-09-27 QR management and Activity alignment
- XPay has a centered title, Create (+) and payment-history icons, and a saved-QR list including standalone bank/wallet QRs.
- Bank QR detail uses Pocket typography, 1024px PNG download, and PIN/biometric-protected retirement. Durable tombstones stop new scans and quotes without deleting merchant ownership, in-flight payments or receipts. Activity cache keeps retirement monotonic.
- POS history and combined XPay history reuse the Activity component; POS View payments opens history directly. Incoming terminal payments remain separate from outgoing purchases.
- Wallet Create/Edit link uses a fixed form and CTA, separate full asset selector, no autofocus on opening, and no 100-asset truncation. Wallet address initialization no longer remounts the form.
- Read-only XPay requests retry one transient gateway failure; owner-scoped list cache retains successful data. History uses read rate limiting. Mutations are never automatically replayed.
- Verified with synthetic browser fixtures (both origin rails, keyboard-height layout, light/dark, dates, receipts, PNG download, deletion) and backend fixtures (ownership/PIN, idempotency, retired scan/quote rejection, history preservation). No live payment made.
- Navigation release 9cf4f2b was confirmed live on Render. This follow-up release is awaiting final build, deploy and Pixel installation verification.

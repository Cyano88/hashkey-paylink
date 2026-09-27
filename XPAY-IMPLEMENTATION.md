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

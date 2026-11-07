# Solana bridge settlement delay and progress copy - 2026-11-07

Pixel showed SOL to Arbitrum USDC stuck on Bridging with the helper sentence the owner asked to remove. Operation f2c26fe8-c1c1-46bf-be08-aad5e95333b4 had signed bytes and source hash; the prior expired reservation had been atomically cancelled when this replacement was prepared.

Read-only chain checks confirmed finalized source receipt, no transaction error, exact signed message, exact owner debit, reimbursement, vault credit and sponsor fee. Relay reported success. Running the existing reconciler for this saved operation returned `Bridge recovery state changed or is unavailable` at cross-bridge-settlement.ts fingerprint comparison. No signing or broadcast occurred during diagnosis.

Root cause: the coordinator fingerprinted a structuredClone of its initial validated plan. Solana TransactionInstruction objects contain PublicKey instances with canonical JSON serialization. structuredClone strips that prototype, so the fingerprint differed from the freshly reconstructed plan supplied to the atomic mutation. Existing fixtures cloned plans before injecting them and therefore missed production behavior.

Fix: compute the identity fingerprint on the original validated plan before taking the defensive clone. Source/destination finality, exact amount, provider binding and concurrent-change checks remain intact. Regression now passes real reconstructed SOL, USDC and USDT instruction objects at the read/mutate boundary. The full settlement suite also covers 56 directed network pairs, source-proof failure/pending, no provider-only success and idempotent publication.

Native change: removed the progress helper sentence and its unused delay calculation from PocketBridgeProgressSheet. No added waiting text. Full nine-case cross-bridge panel browser suite passed.

Live backend a7fdd125203e1c65b548647370f867053c0d9787 verified after deploy dep-dbnfuclg1s2s73cjn9ag. Normal recovery advanced the real operation to completed (updatedAt 1794048100666), without resubmission. Native APK pocket-bridge-delay-ui-20261107.apk installed successfully: SHA256 29AEEFDC3456CCF21C37F2FC1A2CD30BADAA4F8CF49CD2CEB01445EEC907BF11; 1870 assets verified. Focused native and backend typechecks passed.

Owner also reported a duplicate USDC Received row beside SOL Bridge Processing. Existing exact-destination-hash grouping was prevented by the same missing settlement link. Added a 56-directed-pair regression proving grouping of matched destination receipts and retention of unrelated deposits. Pixel final refresh verification remains in progress.

Pixel live verification at 11:45: Home shows one SOL Bridge entry; duplicate +1.28 USDC Received row is absent and Processing is absent. Screenshot: native output/bridge-swap-audit-20261105/balance-bridge-activity-final-check.png. Receipt tap was not executed because Pocket left foreground; do not claim a live receipt inspection. Completed journal plus actual Home grouping verified. No payment was initiated or resent.

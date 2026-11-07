# Solana bridge settlement delay and progress copy - 2026-11-07

Pixel showed SOL to Arbitrum USDC stuck on Bridging with the helper sentence the owner asked to remove. Operation f2c26fe8-c1c1-46bf-be08-aad5e95333b4 had signed bytes and source hash; the prior expired reservation had been atomically cancelled when this replacement was prepared.

Read-only chain checks confirmed finalized source receipt, no transaction error, exact signed message, exact owner debit, reimbursement, vault credit and sponsor fee. Relay reported success. Running the existing reconciler for this saved operation returned `Bridge recovery state changed or is unavailable` at cross-bridge-settlement.ts fingerprint comparison. No signing or broadcast occurred during diagnosis.

Root cause: the coordinator fingerprinted a structuredClone of its initial validated plan. Solana TransactionInstruction objects contain PublicKey instances with canonical JSON serialization. structuredClone strips that prototype, so the fingerprint differed from the freshly reconstructed plan supplied to the atomic mutation. Existing fixtures cloned plans before injecting them and therefore missed production behavior.

Fix: compute the identity fingerprint on the original validated plan before taking the defensive clone. Source/destination finality, exact amount, provider binding and concurrent-change checks remain intact. Regression now passes real reconstructed SOL, USDC and USDT instruction objects at the read/mutate boundary. The full settlement suite also covers 56 directed network pairs, source-proof failure/pending, no provider-only success and idempotent publication.

Native change: removed the progress helper sentence and its unused delay calculation from PocketBridgeProgressSheet. No added waiting text. Full nine-case cross-bridge panel browser suite passed.

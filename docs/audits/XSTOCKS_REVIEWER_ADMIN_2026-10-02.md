# X Layer Trade reviewer operations

Adds /admin/trade-disputes within the existing developer operations shell. Uses its Plus Jakarta Sans font, navigation, cards and existing Privy external-wallet connector. External wallets remain disabled on consumer surfaces.

The server requires the existing developer admin allowlist. Only verified share-custody Trade records are supported. The existing planner validates factory runtime, registry and immutable escrow terms. Reviewer Safe version 1.5.0, two owners and threshold two are required. Confirmed and latest owner/nonce snapshots must agree.

Decisions bind agreement, escrow, allocation, reason, chain 196, Safe address and nonce. Local EIP-712 hashes must equal the Safe contract hash. Exact allocation precision is enforced. Both signatures are recovered and verified against distinct current owners. Execution calldata uses CALL, zero native value and no gas refund. Full signed execution is simulated before returning an unsigned outer transaction to an owner wallet. No backend signing keys or broadcast path exist.

A recorded decision cannot be overwritten. Nonce drift marks it stale and blocks signing/execution; renewing such a decision is not yet implemented. Supported first scope is exact-reference case lookup, not a complete dispute queue. The browser saves a submission recovery marker before requesting broadcast; uncertain submissions are not automatically retried. Confirmation and terminal receipts are read from the chain, not inferred from signatures or a transaction hash.

Validation: reviewer smoke suite covers unauthorized access, decimal bounds, dispute-only preparation, changed owner threshold, chain/nonce binding, wrong signer, incomplete signatures, rejected simulation and final-state rejection. Targeted TypeScript checks pass. Production Vite build passes with existing vendor annotation/chunk-size warnings. Desktop and mobile fixture checks exercise review/preparation and approval gating; wallet hardware approvals and final live execution remain to be tested.

Current controlled case: xag_69f6e0f55d879111dc05a805d313a3154f873412d87135165ff94a25c25b3fad, escrow 0x5507C575a5B261f775260A056F962B8cad122D47. State 5 Disputed confirmed earlier; no reviewer signatures or refund transaction submitted by this implementation.

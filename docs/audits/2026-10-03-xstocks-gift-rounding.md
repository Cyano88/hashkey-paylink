# XStocks gift funding: verified rounding mismatch

Read-only X Layer simulation reproduced `IncorrectTransfer()` (`0xf729790c`) for the NVDAx pilot gift. The allowance transaction succeeded; the gift remains unfunded. No funding transaction was sent by the diagnostic.

An `eth_call` code override replaced only the escrow implementation for the simulation, retaining actual token state and the existing allowance. It measured both transfer legs without persisting changes:

| Measurement | Raw units (18 decimals) |
| --- | ---: |
| Requested deposit | 20050000000000 |
| Escrow deposit balance increase | 20049999999999 |
| Requested fee | 50000000000 |
| Escrow fee debit | 50000000000 |
| Treasury fee credit | 49999999999 |

The live multiplier read was 1001701196801074000. The issuer describes share-based EVM accounting: https://docs.xstocks.fi/developers/multipliers . Its reference implementation exposes `sharesOf`, `getSharesByUnderlyingAmount`, `getUnderlyingAmountByShares`, `transferShares`, and `transferSharesFrom`: https://github.com/backed-fi/backed-token-contract/blob/main/contracts/BackedAutoFeeTokenImplementation.sol . This source is design evidence, not proof that every catalogue asset has identical deployed bytecode.

## Required replacement design

The current immutable escrow cannot be patched in place. Keep its exact-transfer guard and preserve Base USDC behavior. Do not introduce an arbitrary one-unit tolerance: funding, fee, claim and refund rounding differ, and multiplier changes can change nominal balances after funding.

A separately versioned stock escrow must hold liabilities in verified internal token shares, allocate equal shares per recipient, charge the 25-bps fee in the same share unit, and transfer and verify exact shares for funding, claims and refunds. Quote current stock quantities separately, bound the sender's debit, and reject changed quotes before approval. Explicitly define rounding and remainder ownership. Claims must carry the gifted position's subsequent multiplier adjustments.

Before activation: verify the share API and implementation for each enabled asset; test rounding, positive and negative multiplier changes, multiple simultaneous gifts, duplicate claims, fee accounting, partial expiry refunds and failing transfers. Update client signing, server observation, receipts and draft migration together. The old unfunded draft and allowance do not authorize a replacement escrow.

## Regression coverage

`PocketGiftStockRounding.test.ts` reproduces the observed deposit and fee shortfalls with a local share-accounting model, proves current funding reverts atomically without creating liabilities, and demonstrates why fixed nominal liabilities cannot track multiplier changes. It is not a completed replacement implementation or production deployment.

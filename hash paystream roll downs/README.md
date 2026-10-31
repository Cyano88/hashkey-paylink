# Retired product code

Archived by the owner request on 2026-10-31. This replaces the prior embedded-app migration requirement in AGENTS.md.

`streampay/` is the former `modules/streampay/` at the same relative directory depth. It is no longer a browser entrypoint. Do not mount its HTTP handlers or rebuild its job/creator/streaming UI into the active product.

Historical IDs, records, receipts and contract references are preserved. The receipt reader remains a narrow compatibility dependency until its data is migrated. This archive does not imply that customer funds have been swept or liabilities discharged.

The future Hash PayLink Escrow service remains under development in the main repository. Trade is a separate retained product boundary. Re-enabling any archived feature requires an explicit product decision, reconciliation and security review.

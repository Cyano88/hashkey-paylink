# Pocket Support investigation audit - 2026-10-02

## Delivered scope
- Missing payment and balance discrepancy conversations collect product, network, transaction hash/reference, amount/currency and time without auto-handoff.
- Incoming/outgoing record choices are authenticated and receipt selection must have been offered by the most recent answer.
- NGN/UGX candidates use original recorded local amounts and currency, with original USDC amount secondary. No current FX reconstruction of historical payments. WAT/EAT times are parsed only when explicit.
- Direct incoming USDC check: Base, Arbitrum, Polygon, Ethereum and Arc; current linked receiving wallet, native USDC emitter, chain ID, successful receipt and canonical inclusion block. This is inclusion evidence, not an assurance of finality, balance availability or bank delivery.
- Selected bank payments can read the exact provider order with GET only, eight-second timeout and validated returned order ID/status. No settlement hooks, refunds, writes or payment retries.
- Three live chain checks and three provider selections per account per hour based on private conversation history; no broad chain scans. Existing message rate limits and duplicate request protections retained. Concurrent request reservation remains a hardening item.
- Human handoff keeps its acknowledgement and preserves the conversation evidence. Missing-funds investigations are protected from automatic unresolved-case closure.
- Personal transaction details are not passed to 0G inference or public storage. 0G's existing narrow intent/approved-knowledge matching remains unchanged.

## Verification
- Strict targeted TypeScript diagnostics: zero.
- Account, conversation, handler, recovery UI, retry/draft and adversarial investigation tests passed.
- Pixel WebView: real chat component and conversation/account logic, synthetic records/provider results. Missing-USDC follow-ups, receipt navigation, balance discrepancy, explicit handoff, NGN/UGX separation, composer, retries and layout exercised without creating production cases/payments.
- Pixel test caught a product-choice bug that reset a balance investigation; fixed and regression-tested.
- Separate read-only live audit script verifies actual NGN/UGX provider references and a saved incoming USDC transaction. Deployment execution results must be recorded separately; fixture success is not a live-provider certification.

## Readiness limits
This is a bounded support release, not blanket certification of Pocket or autonomous payment diagnosis. XStocks/Solana live chain investigation, a fresh spendable-balance reconciliation tool and fresh VTpass fulfilment checks are not implemented by this change. Those cases keep their evidence and offer human support; saved records are labeled accordingly. Old migrated receiving addresses are not automatically searched. Real provider disagreements require staff review. No payment is retried or moved by Hash.

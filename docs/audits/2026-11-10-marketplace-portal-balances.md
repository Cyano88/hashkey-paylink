# Marketplace developer balance view - 2026-11-10

Added Payments > Marketplace balances in the live developer app portal. The signed-in app owner can view pending, available, reserved and paid balances per seller, separate asset totals, recipient roles/routes and withdrawal allocation statuses. Exact seller-reference search and 30-second visible-tab refresh are provided. Errors preserve the last successful view with an explicit stale-data notice; initial loading uses shared shimmers. Six-decimal integer amounts are rendered without trailing zero padding.

GET /api/developer-projects?resource=marketplace-balances&projectId=... uses existing Privy authentication and owner lookup before reading the accounting store. It rejects sandbox requests and invalid seller references, filters all ledger data to the owned app and returns only an allowlisted presentation. No bank details, ciphertext, wallet keys, payer information or raw proofs are included. This endpoint does not release or withdraw money. Up to 100 sellers/withdrawal allocation rows are displayed; totals cover the entire selected scope. An exact seller filter can retrieve sellers outside the first 100.

Pending includes funds awaiting collection finality or marketplace release. Cash balance remains USDC accounting until an eligible NGN withdrawal. A displayed balance is not payout authorization or a fee quote.

Validation: owner-bound API fixture tests and integer-total/project-privacy projection tests passed; browser checks passed at 320/390/1280 in light/dark, covering shimmer, clean decimals, stale refresh/retry, search/clear and overflow. Mobile dark screenshot reviewed. Focused TypeScript diagnostics passed (41 files). Production build passed to an isolated temporary output directory. No funds moved.

# Local 0.10 USDC Trade canary

The local rehearsal targets the independently verified Arc Trade factory and
2-of-2 Safe, using the selected buyer and seller's existing Circle wallets.
This is a contract/provider lifecycle canary, not proof of the deployed hosted
Privy/developer-API flow. Production feature gates remain inactive.

`node --import tsx scripts/prepare-arc-trade-canary.mjs` performs read-only
preflight, saves fixed terms once, and simulates seller creation. Principal is
100000 USDC base units (0.10 USDC), delivery fee zero, no goods, one-day dispatch
and delivery windows, 24-hour inspection, and a 24-hour funding deadline.
The stated recovery intent is return of the principal to the buyer after testing.
No challenge or transaction is created by preparation.

Run `node --import tsx scripts/serve-arc-trade-canary.mjs`, then open
http://127.0.0.1:4391/seller/. Seller signs creation and terms acceptance. Buyer
then uses /buyer/ to approve exactly 0.10 USDC and fund. Each step uses the existing
Trade planner/simulation and real Circle challenge SDK. Browser inputs never
supply calldata or destinations. The session must own the exact linked wallet,
including the activated Pocket replacement wallet. The server keeps provider
credentials in memory; session tokens are neither logged nor stored.

The server binds to loopback and checks Host and write Origin. Allowed operations
are create/accept for seller and approve/fund for buyer. Intent validation rejects
extra fields, changed terms, other networks/amounts and wrong roles. The approval
step requires zero prior allowance, so it cannot silently perform an allowance
reset or increase beyond the canary amount. The page stops after funding.

An exclusive pending file is written before provider submission, with stable
idempotency key, exact planned call and preparation block. Unknown outcomes retain
that file. Existing PENDING challenges can only be resumed explicitly. Confirmed
entries move to history only after provider identity/ref correlation, the shared
v0.7 receipt verifier, exact escrow term/state checks and (where relevant) exact
0.10 USDC allowance/escrow balance checks. No browser transaction hash is trusted.
Reverted, missing or uncertain outcomes require review; no automatic reset exists.

Checks: focused intent tests and read-only HTTP restrictions; existing planner and
execution tests cover chain simulations/receipt tampering. Email approval and the
funded lifecycle require human interaction and are not claimed by these checks.
Operational plan, wallet identities and journals stay untracked in `.codex-temp`.

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
reset or increase beyond the canary amount. After funding verification, the seller
can authorize a full refund to the original buyer through the same local page.

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

## Funding verified

The 0.10 USDC canary reached Funded on Arc mainnet. Transaction
`0xcef3304c273d96a3092b229203afe5619002ec2f32c945765ea8348cebe5dd78`
at block 24094299 passed the shared v0.7 execution verifier. A fresh read at block
24094830 confirmed the exact immutable terms, Funded state and 100000 USDC base
units in escrow `0x28f45A2C318857c048d14e71ACD0318A8aF9A1c9`. The receipt contains
the exact buyer-to-escrow 100000-unit transfer. Creation, seller acceptance,
approval and funding are recorded as confirmed in the local journal.

`node --import tsx scripts/verify-arc-trade-canary-funding.mjs` repeats these
read-only checks while the escrow remains Funded. Recovery/refund has not yet
completed; this evidence does not declare the full product production-ready.

## Seller refund preparation

The refund subsequently confirmed in transaction
`0x894345295b85a20084bdf1019e210a5594f54551e67b5efba6f154b922b594e4`
at block 24107842. Independent re-verification at block 24108204 confirmed state
Refunded, exactly 100000 base units returned to the buyer, zero seller allocation,
and zero escrow balance. `scripts/verify-arc-trade-canary-refund.mjs` repeats this
check. This completes the local funding/refund canary, not hosted product testing.

The local canary now permits seller-only `refundBySeller` from confirmed Funded
state, using fixed server-owned evidence. The contract returns the entire
principal to its immutable buyer; the browser cannot supply an amount, recipient
or evidence. The production planner simulates the call before requesting Circle
approval. The buyer has no refund signing action.

Reconciliation requires the existing v0.7 execution verification, terminal
Refunded state, the shared settlement receipt verifier with exact outgoing USDC
transfer, buyer allocation 100000, seller allocation zero, the fixed evidence hash
and zero escrow balance. The verified settlement receipt is saved in the local
journal before clearing the pending request. No production receipt store is used.
This is a voluntary seller refund, not the dual-signer dispute resolution test.

`node --import tsx scripts/check-arc-trade-canary-refund.mjs` performs read-only
mainnet wallet validation and refund simulation, including buyer-role rejection.
`node scripts/check-arc-trade-canary.mjs --refund` checks the local funded UI and
request restrictions without creating an OTP or signing challenge.

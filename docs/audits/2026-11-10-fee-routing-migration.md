# Fee-routing migration - 2026-11-10

## Authorized destinations

| Purpose | Destination |
| --- | --- |
| EVM gas reimbursement | `0xbf36A13d26DF07dbb7A9a1eed1b5a575D4AdA822` |
| EVM checkout/platform fees | Existing `0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753` |
| EVM bridge platform revenue | Existing configured `0xd7579fa0784288eF6eAB335bc97d3C8ebc7eC435` |
| Solana platform revenue | `Cj7mBKS9uW9zbkfTwCKReEVRGYQD1QJZkA7VbzuUERaA` |
| Solana gas reimbursement | Existing `Gs7RTc4iW5HE7r1s9AC2UwgEhb4uJ5vxZ9idFHh6x73J` |

The owner supplied both new destinations. Their EVM checksum and Solana public-key format were validated. This is not an independent proof of key ownership. Existing funds are not swept or transferred. Bills and Marketplace holding configuration is unchanged. Marketplace fee reserves stay in its accounting/holding flow; this migration does not withdraw accrued reserves or change its activation gates.

## Implementation

Signed fee quotes now carry `feeRoutingVersion: 2`. Missing version retains the legacy combined fee destination. New EVM checkout transactions transfer recipient principal, platform fee and gas reimbursement separately. Solana checkout similarly separates platform fees from reimbursement, estimates the actual instruction topology and any additional token-account rent, and retains the lower live gas collection behavior for gross quotes.

The same version is preserved in Circle EVM bridge, native send/swap, Cash conversion, BSC send/payment/swap/outbound bridge, and X Layer sponsored send/payment/swap/bridge records. Existing cross-bridge plans already snapshot their reimbursement recipient. Canonical receipt/trace verification uses the saved routing version or recipient, never a blanket substitution of historical destinations. Both historical and new gas addresses remain recognizable in verified activity evidence. Platform fees embedded in swap/bridge provider calls remain separate and keep their existing EVM recipient.

Marketplace funding verification now requires the exact fee legs dictated by its accepted signed quote and rejects missing gas, extra payer outflows or changed totals. XPay binds the routing version as well as fee amounts at submission. Pocket's signed request validators understand the new calls; activity grouping recognizes the gas wallet and removes exact merchant fee legs only when a verified checkout supplies their amounts.

Only `POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS` needs a production environment update. Do not replace `SOLANA_TREASURY` or `TREASURY_ADDRESS`: they retain their existing roles for Solana gas and EVM platform fees. Rebuild/install Pocket from the verified native source before using its new signing requests. Older installed clients with fixed legacy call validators may require an app update; a debug device install is not a Play Store rollout.

## Verification

The combined targeted regression run covers 146 unique suites, including fee quotes, exact EVM and Solana transfers, legacy quote recovery, signed-call validation, provider failures, retry/idempotency, bridge route matrices, accounting and receipt grouping. All pass after fixture updates. The new migration suite explicitly verifies old native/bridge calldata and rejects mismatched routing versions. Additional XPay tests prove that new split receipts cannot satisfy legacy combined quotes or vice versa. No test sends real funds.

Focused TypeScript checks pass for 71 files and the web production build passes. The original Pocket native source-lineage check passes. Native build/install and deployed commit verification are recorded in the release response. Test fixtures were also repaired where pre-existing pause/worker dependencies were not isolated or notification labels had changed; no production pause policy or notification wording was relaxed to satisfy tests.

## Acceptance limits

No new funded transaction or historical receipt/webhook delivery is part of this migration. Live fee collection should be checked on the next separately approved payment. The reimbursement wallet receives the fee asset; it does not automatically refill a relayer's native-gas balance. Operator conversion/top-up remains a separate process.

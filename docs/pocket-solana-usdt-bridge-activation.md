# Solana USDT bridge activation

API and existing Pocket bridge sheet wired locally. Not enabled in production.
New Solana-source quotes require `POCKET_SOLANA_USDT_BRIDGE_ENABLED=true`;
the default is off. Saved transfers remain recoverable when the flag is off.

Arbitrum to Solana execution is now wired locally through the existing EVM
Circle challenge, gas reimbursement, signed quote and action journal. New quotes
and the destination selector require `POCKET_EVM_SOLANA_USDT_BRIDGE_ENABLED=true`
(default off). `RELAY_API_KEY` is required for execution quotes and recovery.
Source proof checks the exact RelayErc20Deposit order, total USDT debit and
treasury reimbursement. Completion checks the saved request/order and net USDT
received by the linked Solana wallet. Refunds are verified on either permitted
chain and retain their actual amount. Neither flag disables saved-transfer recovery.

Implemented: quote validation for Solana to/from Base and Arbitrum; Solana-source
transaction preparation with network reimbursement and no Pocket platform fee;
durable owner-scoped approval/submission state; Circle signing dispatch for saved
USDT transactions; exact message and sponsor-signature validation; challenge reuse;
persisted signed bytes before broadcast; restart and same-transaction recovery.

Destination/refund reconciliation now matches the saved Relay request and order,
source transaction, linked recipient and chain. It checks net USDT received from
EVM transfer logs or Solana token-balance metadata before persisting completion or
refund. EVM receipt blocks are checked against the current canonical block hash.
Refunds retain the actual returned amount; no assumption of a full principal refund.
The USDT money-ledger event is idempotent and retried after a persistence/write gap.

Schema references: [Relay status](https://docs.relay.link/references/api/get-intents-status-v3)
and [Relay requests](https://docs.relay.link/references/api/get-requests).
Settlement tests use synthetic schema fixtures; live response compatibility and
onchain delivery remain unverified. These checks are not a finality guarantee.

Circle's `signOwnWalletBridge` action accepts `asset: USDT` only with a persisted
server-created bridge record and matching authenticated wallet links. Authenticated
quote/submission/status routes create and recover records. Registration is server-only.
Pending discovery, the existing background bridge worker, activity journal and
money ledger share the saved record. The existing bridge sheet retains signed
bytes before submission and reuses Circle approval and transaction sheets.

Required before activation:

1. Verify live Circle approval, delivery/refund schema, receipts and notifications.
2. Unknown Circle challenge reconciliation without creating another challenge.
3. Device checks for approval, refresh/restart recovery and sheet presentation.
4. Credential, treasury-token-account and relayer checks, then controlled live tests.

Arbitrum to Solana is the first EVM-source route; Base to Solana remains unavailable.
Native Solana gifting has its own deployment and
application integration gates; this bridge work does not activate it.

Run `npm run test:pocket-solana-usdt-relay`. Isolated tests cover provider quote
tampering, fees, partial signatures, ownership, message binding, challenge reuse
and concurrency, unknown approval results, restart recovery and blockhash expiry.
They do not establish successful live Circle signing or destination delivery.

Run `node --import tsx scripts/pocket-evm-solana-usdt-smoke.mjs` for the Arbitrum
execution/recovery checks and `node scripts/pocket-usdt-bridge-form-smoke.mjs`
for the shared selector and warning UI. The latter uses mocked wallets and quotes.
High provider cost is a nonblocking warning, not a fee-percentage rejection;
asset, wallet, order and slippage validation remain enforced.

# Circle EVM Gas Station boundary

Hash PayLink uses Circle Gas Station as the primary gas path for customer-controlled Circle wallets on:

- Base mainnet
- Arbitrum mainnet
- Arc Testnet

## Runtime boundary

Before creating a Circle transaction challenge, the server re-reads the wallets owned by the current Circle user token and requires an exact match on wallet ID, address, and blockchain. The matched EVM wallet must be a live SCA. EOA wallets and mismatched wallets fail before contract execution is submitted.

Circle applies Gas Station automatically when the network's default policy is active and the transaction meets that policy. Hash PayLink does not pass a policy ID and does not silently retry a Circle-wallet transaction through a Hash PayLink relayer.

Customer-controlled EVM actions covered by this boundary include checkout payments, Pocket withdrawals, Base and Arbitrum CCTP source actions, Arc funding actions, Arc payer lifecycle actions, and supported Arc application calls.

## Fees

Circle-sponsored EVM payments collect the published Hash PayLink platform fee. They do not add the legacy per-network gas-recovery deduction. External-wallet relay paths are separate and may retain a separately disclosed reimbursement where still enabled.

## Fallback policy

If Circle rejects sponsorship or the transaction outcome is uncertain:

1. Reconcile the Circle challenge and transaction ID.
2. Retry only through the Circle flow with the durable business idempotency record.
3. Fail closed if Circle cannot produce a safe outcome.

The legacy EVM relayers remain available only for explicitly compatible external-wallet paths. They are not a fallback signer for Circle SCAs.

## Arc operator exception

The existing Arc agreement operator is an independently configured developer-controlled Circle wallet and may be tied to immutable deployed contract configuration. Do not require an SCA or replace that address without a separate contract and wallet migration. Customer payer actions remain protected by the SCA boundary above.

## Production checks

- Base mainnet default Gas Station policy is active.
- Arbitrum mainnet default Gas Station policy is active.
- Arc Testnet default policy is available.
- Policy spend and operation limits cover checkout batches and Arc actions.
- Circle billing is current.
- Sponsored transactions appear in the corresponding Circle policy dashboard.

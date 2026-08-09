# Circle Solana Gas Station boundary

Hash PayLink uses Circle's managed user-controlled wallet transaction API as the primary path for normal Pocket USDC transfers on Solana mainnet.

## Normal transfers

Before creating a transfer challenge, the server re-reads the wallet owned by the current Circle user token and requires an exact wallet ID, address, and SOL blockchain match. The wallet must be a live EOA, because Solana does not support Circle SCA wallets.

The server then creates a `POST /v1/w3s/user/transactions/transfer` challenge for native Solana USDC. Circle handles wallet approval, broadcasting, and Gas Station sponsorship when the active Solana policy accepts the transaction.

Hash PayLink does not charge its legacy Solana gas-recovery amount on this Circle-managed normal-transfer path.

## Checkout and CCTP boundary

Hosted checkout uses an atomic multi-instruction transaction for recipient payment and the disclosed platform fee. Solana-to-EVM CCTP uses a custom raw Bridge Kit transaction. Circle documents raw transaction signing as a bring-your-own-broadcast flow; it does not document Gas Station sponsorship for these custom raw transactions.

Until Circle exposes that capability, checkout and CCTP must use a separately validated Hash PayLink fee-payer relay. They must not pretend Circle sponsored the transaction. The relay must validate the fee payer, wallet signer, program IDs, token mint, amounts, recipients, CCTP destination, and every signature before broadcasting.

## Production checks

- Solana mainnet Gas Station policy is active and default.
- Circle billing is current.
- Policy limits cover expected normal transfers.
- Circle has enabled permissioned ATA sponsorship if first-time recipient token accounts should be created without Hash PayLink SOL.
- Normal-transfer transactions appear in Circle's sponsored-transactions dashboard.

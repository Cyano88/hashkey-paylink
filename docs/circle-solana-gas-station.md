# Circle Solana Gas Station boundary

Hash PayLink uses Circle's managed user-controlled wallet transaction API as the primary path for normal Pocket USDC transfers on Solana mainnet.

## Normal transfers

Before creating a transfer challenge, the server re-reads the wallet owned by the current Circle user token and requires an exact wallet ID, address, and SOL blockchain match. The wallet must be a live EOA, because Solana does not support Circle SCA wallets.

The server then creates a `POST /v1/w3s/user/transactions/transfer` challenge for native Solana USDC. Circle handles wallet approval, broadcasting, and Gas Station sponsorship when the active Solana policy accepts the transaction.

Hash PayLink does not charge its legacy Solana gas-recovery amount on this Circle-managed normal-transfer path.

## Checkout and CCTP boundary

Hosted checkout uses an atomic multi-instruction transaction for recipient payment and the disclosed platform fee. Solana-to-EVM CCTP uses a custom raw Bridge Kit transaction. Circle documents raw transaction signing as a bring-your-own-broadcast flow; it does not document Gas Station sponsorship for these custom raw transactions.

Until Circle exposes that capability, checkout and CCTP use separately validated Hash PayLink fee-payer relays. They must not be represented as Circle-sponsored transactions.

For Pocket Solana-to-EVM CCTP, the client lets Circle Bridge Kit construct the burn instructions, then hands the unsigned transaction to an authenticated Hash PayLink prepare route. The server accepts only the current Circle mainnet Bridge Kit forwarding shape, verifies the linked Circle wallet, USDC mint, amount, recipient, Base or Arbitrum domain, program IDs, fixed event-rent amount, instruction count, and signer set. It replaces only the transaction payer, CCTP event-rent payer, and any idempotent ATA payer with the Hash PayLink relayer. The Bridge Kit message signer and Circle user wallet then sign before the server revalidates every signature and broadcasts.

Solana remains excluded from automatic checkout bridge-source routing until this relay passes a controlled mainnet CCTP test. Normal Circle-managed Solana transfers and the hosted-checkout relay are separate execution paths.

## Production checks

- Solana mainnet Gas Station policy is active and default.
- Circle billing is current.
- Policy limits cover expected normal transfers.
- Circle has enabled permissioned ATA sponsorship if first-time recipient token accounts should be created without Hash PayLink SOL.
- Normal-transfer transactions appear in Circle's sponsored-transactions dashboard.
- The Hash PayLink Solana relayer retains enough SOL for CCTP event rent and transaction fees; CCTP relay transactions will not appear as Circle Gas Station sponsorship.

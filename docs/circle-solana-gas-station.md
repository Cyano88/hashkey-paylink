# Circle Solana Gas Station boundary

Hash PayLink uses Circle's managed user-controlled wallet transaction API as the primary path for normal Pocket USDC transfers on Solana mainnet.

## Normal transfers

Before creating a transfer challenge, the server re-reads the wallet owned by the current Circle user token and requires an exact wallet ID, address, and SOL blockchain match. The wallet must be a live EOA, because Solana does not support Circle SCA wallets.

The server then creates a `POST /v1/w3s/user/transactions/transfer` challenge for native Solana USDC. Circle handles wallet approval, broadcasting, and Gas Station sponsorship when the active Solana policy accepts the transaction.

Hash PayLink does not charge its legacy Solana gas-recovery amount on this Circle-managed normal-transfer path.

## Checkout and CCTP boundary

Hosted checkout uses an atomic multi-instruction transaction for recipient payment and the disclosed platform fee. Solana-to-EVM CCTP uses a custom raw transaction. Circle Technical Support confirmed that the Sign Transaction API can authorize a transaction whose SOL fee payer is a different wallet, but Bridge Kit cannot assign that payer; the transaction must be constructed manually.

Until Circle exposes that capability, checkout and CCTP use separately validated Hash PayLink fee-payer relays. They must not be represented as Circle-sponsored transactions.

For Pocket Solana-to-EVM CCTP, an authenticated Hash PayLink route constructs the approved mainnet forwarding transaction directly from the current on-chain program configuration. Hash PayLink assigns its SOL-funded relayer as both transaction fee payer and CCTP event-rent payer, generates and signs the temporary message account, and validates the linked Circle wallet, USDC mint, amount, recipient, Base or Arbitrum domain, program IDs, forwarding hook, fee limits, instruction count, and signer set. The Circle user-controlled wallet then authorizes only its USDC burn through the Sign Transaction API. Hash PayLink revalidates every signature before broadcast. The browser neither constructs nor rewrites the transaction.

The relay passed a controlled Solana-to-Base mainnet CCTP test on 10 August 2026. Solana is therefore eligible as a single automatic bridge source in supported Pocket payment-liquidity routes. Routing never combines multiple source networks, and normal Circle-managed Solana transfers and the hosted-checkout relay remain separate execution paths.

## Production checks

- Solana mainnet Gas Station policy is active and default.
- Circle billing is current.
- Policy limits cover expected normal transfers.
- Circle has enabled permissioned ATA sponsorship if first-time recipient token accounts should be created without Hash PayLink SOL.
- Normal-transfer transactions appear in Circle's sponsored-transactions dashboard.
- The Hash PayLink Solana relayer retains enough SOL for CCTP event rent, any required token-account rent, transaction fees, and the configured operating buffer. Preparation stops before Circle authorization when that balance is insufficient. CCTP relay transactions will not appear as Circle Gas Station sponsorship.

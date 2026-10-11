# Solana relayer reimbursement

Normal USDC/USDT sends have zero platform fee. The reimbursement is the RPC-estimated transaction fee plus required token-account rent, converted using the fresh SOL/selected-stablecoin price. Round up only to the next 0.000001 token; no percentage markup.

The accepted signed quote is a ceiling: a lower estimate at preparation reduces collection; an increase requires a new quote. Pocket bears differences arising after signing. No automatic post-transaction debit or automatic SOL purchase is implemented.

Before preparing quoted transfers and CCTP bridges, check the relayer SOL balance. Insufficient funds block signing. Server warnings use event `pocket-solana-relayer-low-balance`, throttled to once per wallet per five minutes while low. `SOLANA_RELAYER_LOW_BALANCE_LAMPORTS` defaults to 50000000 (0.05 SOL), checked against balance after the estimated transaction cost. This reserve is never charged to customers.

Warnings are emitted during transaction preparation, not by a scheduled monitor. No external notification channel or automatic top-up is configured by this change. Connect the structured warning to the deployment's alert system before relying on proactive notification.

CCTP USDC bridge quotes now include the existing event-rent funding, required bridge token-account rent and the RPC fee for the full transaction including reimbursement. Collection uses a canonical USDC transfer to SOLANA_TREASURY in the same atomic transaction. The operational buffer is excluded. The treasury USDC account must already exist; missing treasury provisioning blocks quoting. The requested destination amount stays unchanged and Circle provider fees remain separate from reimbursement in server accounting.

The 30-second HMAC quote binds the exact partially signed transaction, wallet, destination, amount and costs. Preparation and Circle signing require an unexpired quote; submission may use an expired quote only with the identical fully signed message and matching block height (the network enforces blockhash validity). Modified instructions and signatures are rejected. Funding callers enforce their previously reviewed total as a ceiling. Deploy backend and updated client together; older clients without the quote token must refresh.

This implementation is local and tested with fixtures, not deployed or proven with a live bridge. Treasury setup, relayer SOL reserve and successful destination delivery require live release verification. The Relay USDT bridge adapter remains disabled.

Validation: solana-payment-fees-smoke, pocket-usdt-send-smoke, pocket-solana-relayer-fees-smoke and pocket-solana-cctp-relay-smoke. All use synthetic wallets and mocked upstreams; no live funds move.

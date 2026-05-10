# Circle Paymaster Architecture

Circle Paymaster is prepared as an optional gas-in-USDC path for Hash PayLink. The production-facing UX should stay minimal: Circle Modular Wallets power the "Continue with email" gasless path, while connected EOA wallets keep the normal wallet path.

## Current Production Order

Base connected wallet:

1. Coinbase Smart Wallet/Base Account uses Coinbase/CDP Paymaster through `wallet_sendCalls`.
2. If `wallet_sendCalls` is unavailable, Hash PayLink falls back to the normal permit + Multicall3 transaction.
3. The normal fallback requires Base ETH in the payer wallet.

Arbitrum connected wallet:

1. Hash PayLink uses the existing relayer-assisted native USDC path.
2. The relayer pays Arbitrum ETH gas and is reimbursed according to contract/API limits.

Send via Address:

1. Unchanged.
2. The payer sends USDC to a deterministic vault address.
3. Hash PayLink relays/sweeps funds without requiring a wallet connection.

## Circle Target Order

Base and Arbitrum payer UI:

1. Show `Continue with email` when `VITE_CLIENT_KEY` and `VITE_CLIENT_URL` are configured.
2. Use Circle Modular Wallets passkey login/register.
3. Submit the USDC recipient transfer and 0.2% treasury fee as one ERC-4337 user operation with `paymaster: true`.
4. Show `Connect EOA Wallet` as the secondary path. Base still tries Coinbase/CDP Paymaster for compatible Coinbase Smart Wallet/Base Account connections, then falls back to the normal ETH-gas wallet path. Arbitrum keeps the Hash PayLink relayer path.

Connected-wallet Circle EIP-7702 path:

1. Kept behind `VITE_CIRCLE_PAYMASTER_ENABLED`.
2. Not exposed as a separate CTA in the minimal payer UI.
3. Useful only for wallets that can support the required smart-account/user-operation flow.

## Non-Custodial Boundary

Circle Paymaster pays gas in USDC through a paymaster/bundler flow. It does not custody merchant funds, does not hold payer private keys, and does not change the recipient/treasury split. The merchant payment still routes through Hash PayLink's existing USDC transfer logic.

## Required Runtime Pieces

- `VITE_CIRCLE_PAYMASTER_ENABLED`
- `VITE_CIRCLE_BUNDLER_URL_BASE`
- `VITE_CIRCLE_BUNDLER_URL_ARB`
- `VITE_CIRCLE_PAYMASTER_V08_BASE`
- `VITE_CIRCLE_PAYMASTER_V08_ARB`
- `VITE_CLIENT_KEY`
- `VITE_CLIENT_URL`
- `@circle-fin/modular-wallets-core`
- A Circle Modular Wallet project configured for Base and Arbitrum.

## Supported Chains For This Phase

- Base Mainnet
- Arbitrum One

Do not enable Circle Paymaster for Solana, Starknet, Arc Testnet, or HashKey Chain in this phase.

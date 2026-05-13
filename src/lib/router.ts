/**
 * Stable public EVM clients and PayLinkFactoryV2 ABIs.
 *
 * The legacy PaymentRouterFactory flow is no longer part of the active payment
 * path. Components import EVM_CLIENTS and V2 ABIs for direct recipient payments
 * and CREATE2 ghost-vault relays.
 */

import { createPublicClient, http } from 'viem'
import { base, arbitrum } from 'viem/chains'
import { hashkeyMainnet, arcChain } from './chains'

const RPC_URLS = {
  base:     import.meta.env.VITE_RPC_URL_BASE     ?? import.meta.env.VITE_RPC_URL     ?? 'https://mainnet.base.org',
  hashkey:  import.meta.env.VITE_RPC_URL_HASHKEY  ?? 'https://mainnet.hsk.xyz',
  arc:      import.meta.env.VITE_RPC_URL_ARC      ?? 'https://rpc.testnet.arc.network',
  arbitrum: import.meta.env.VITE_RPC_URL_ARB      ?? 'https://arb1.arbitrum.io/rpc',
} as const

export const EVM_CLIENTS = {
  base:     createPublicClient({ chain: base,           transport: http(RPC_URLS.base) }),
  hashkey:  createPublicClient({ chain: hashkeyMainnet, transport: http(RPC_URLS.hashkey) }),
  arc:      createPublicClient({ chain: arcChain,       transport: http(RPC_URLS.arc) }),
  arbitrum: createPublicClient({ chain: arbitrum,       transport: http(RPC_URLS.arbitrum) }),
} as const

/** Standard ERC-20 Transfer, used for direct recipient receipt detection. */
export const ERC20_TRANSFER_ABI = [{
  name: 'Transfer',
  type: 'event' as const,
  inputs: [
    { name: 'from',  type: 'address', indexed: true  },
    { name: 'to',    type: 'address', indexed: true  },
    { name: 'value', type: 'uint256', indexed: false },
  ],
}] as const

/** ERC-20 balanceOf, used by the manual "Check Status" poll. */
export const ERC20_BALANCE_OF_ABI = [{
  name: 'balanceOf',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '',        type: 'uint256' }],
}] as const

/**
 * Per-chain PayLinkFactoryV2 addresses.
 * All chains fall back to VITE_FACTORY_V2 if their dedicated var is not set.
 */
export const FACTORY_V2_ADDRESSES: Partial<Record<'base' | 'arc' | 'hashkey' | 'arbitrum', `0x${string}`>> = {
  base:     (import.meta.env.VITE_FACTORY_V2         ?? '') as `0x${string}`,
  arc:      (import.meta.env.VITE_FACTORY_V2_ARC     ?? import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`,
  hashkey:  (import.meta.env.VITE_FACTORY_V2_HASHKEY ?? import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`,
  arbitrum: (import.meta.env.VITE_FACTORY_V2_ARB     ?? import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`,
}

/** Convenience alias: Base factory address. */
export const FACTORY_V2_ADDRESS = FACTORY_V2_ADDRESSES.base ?? ('' as `0x${string}`)

/** Emitted by PayLinkFactoryV2.relay() after a successful ghost-vault sweep. */
export const PAYMENT_RELAYED_ABI = [{
  name: 'PaymentRelayed',
  type: 'event' as const,
  inputs: [
    { name: 'linkId',      type: 'bytes32', indexed: true  },
    { name: 'recipient',   type: 'address', indexed: true  },
    { name: 'payout',      type: 'uint256', indexed: false },
    { name: 'platformFee', type: 'uint256', indexed: false },
    { name: 'gasReimb',    type: 'uint256', indexed: false },
  ],
}] as const

/** Emitted by PayLinkFactoryV2.relayNative() after a native token split. */
export const NATIVE_PAYMENT_RELAYED_ABI = [{
  name: 'NativePaymentRelayed',
  type: 'event' as const,
  inputs: [
    { name: 'linkId',      type: 'bytes32', indexed: true  },
    { name: 'recipient',   type: 'address', indexed: true  },
    { name: 'payout',      type: 'uint256', indexed: false },
    { name: 'platformFee', type: 'uint256', indexed: false },
    { name: 'gasReimb',    type: 'uint256', indexed: false },
  ],
}] as const

/** getVaultAddress(linkId, recipient): pre-computes the ghost vault address. */
export const FACTORY_V2_GET_VAULT_ABI = [{
  name: 'getVaultAddress',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs: [
    { name: 'linkId',    type: 'bytes32' as const },
    { name: 'recipient', type: 'address' as const },
  ],
  outputs: [{ name: '', type: 'address' as const }],
}] as const

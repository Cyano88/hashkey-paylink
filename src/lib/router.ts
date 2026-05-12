/**
 * PaymentRouterFactory integration + stable public clients.
 *
 * Public clients are created once at module load (singletons) so they are
 * never re-instantiated on React re-renders. Components import EVM_CLIENTS
 * and call viem methods directly for router prediction and event watching.
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

// ─── Stable public clients ────────────────────────────────────────────────────
export const EVM_CLIENTS = {
  base:     createPublicClient({ chain: base,           transport: http(RPC_URLS.base) }),
  hashkey:  createPublicClient({ chain: hashkeyMainnet, transport: http(RPC_URLS.hashkey) }),
  arc:      createPublicClient({ chain: arcChain,       transport: http(RPC_URLS.arc) }),
  arbitrum: createPublicClient({ chain: arbitrum,       transport: http(RPC_URLS.arbitrum) }),
} as const

// ─── Factory addresses ────────────────────────────────────────────────────────
export const ROUTER_FACTORY: Partial<Record<'base' | 'hashkey' | 'arc' | 'arbitrum', `0x${string}`>> = {
  base:    '0x70Dd5226eB973268263A9AcD8BC48b4E59E7beCA',
  hashkey: '0x70Dd5226eB973268263A9AcD8BC48b4E59E7beCA',
  arc:     '0x70Dd5226eB973268263A9AcD8BC48b4E59E7beCA',
}

// ─── Factory ABIs ─────────────────────────────────────────────────────────────

export const FACTORY_GET_ROUTER_ABI = [{
  name: 'getRouterAddress',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs:  [{ name: 'recipient', type: 'address' }],
  outputs: [{ name: '',          type: 'address' }],
}] as const

export const FACTORY_DEPLOY_ROUTER_ABI = [{
  name: 'deployRouter',
  type: 'function' as const,
  stateMutability: 'nonpayable' as const,
  inputs:  [{ name: 'recipient', type: 'address' }],
  outputs: [{ name: '',          type: 'address' }],
}] as const

// ─── Router event ABIs ────────────────────────────────────────────────────────

/** Emitted by PaymentRouter after every successful sweep split */
export const PAYMENT_ROUTED_ABI = [{
  name: 'PaymentRouted',
  type: 'event' as const,
  inputs: [
    { name: 'token',           type: 'address', indexed: true  },
    { name: 'sender',          type: 'address', indexed: true  },
    { name: 'recipientAmount', type: 'uint256', indexed: false },
    { name: 'treasuryAmount',  type: 'uint256', indexed: false },
  ],
}] as const

/** Standard ERC-20 Transfer — used to detect USDC arriving at router instantly */
export const ERC20_TRANSFER_ABI = [{
  name: 'Transfer',
  type: 'event' as const,
  inputs: [
    { name: 'from',  type: 'address', indexed: true  },
    { name: 'to',    type: 'address', indexed: true  },
    { name: 'value', type: 'uint256', indexed: false },
  ],
}] as const

/** Router sweep ABI — called by keeper or connected wallet to trigger split */
export const ROUTER_SWEEP_ABI = [{
  name: 'sweep',
  type: 'function' as const,
  stateMutability: 'nonpayable' as const,
  inputs:  [{ name: 'token', type: 'address' }],
  outputs: [],
}] as const

/** ERC-20 balanceOf — used for manual "Check Status" polls */
export const ERC20_BALANCE_OF_ABI = [{
  name: 'balanceOf',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs:  [{ name: 'account', type: 'address' }],
  outputs: [{ name: '',        type: 'uint256' }],
}] as const

// ─── V2: PayLinkFactoryV2 (Direct Send / Ghost Address flow) ─────────────────

/**
 * Per-chain PayLinkFactoryV2 addresses.
 * All three chains fall back to VITE_FACTORY_V2 if their dedicated var is not
 * set — useful once the deterministic factory is deployed (same address everywhere).
 */
export const FACTORY_V2_ADDRESSES: Partial<Record<'base' | 'arc' | 'hashkey' | 'arbitrum', `0x${string}`>> = {
  base:     (import.meta.env.VITE_FACTORY_V2         ?? '') as `0x${string}`,
  arc:      (import.meta.env.VITE_FACTORY_V2_ARC     ?? import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`,
  hashkey:  (import.meta.env.VITE_FACTORY_V2_HASHKEY ?? import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`,
  arbitrum: (import.meta.env.VITE_FACTORY_V2_ARB     ?? import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`,
}

/** Convenience alias — Base factory address (backward compat). */
export const FACTORY_V2_ADDRESS = FACTORY_V2_ADDRESSES.base ?? ('' as `0x${string}`)

/** Emitted by PayLinkFactoryV2.relay() after a successful ghost-vault sweep */
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

/** Emitted by PayLinkFactoryV2.relayNative() after a native token (HSK) split */
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

/** getVaultAddress(linkId, recipient) — pre-computes the ghost vault address off-chain */
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

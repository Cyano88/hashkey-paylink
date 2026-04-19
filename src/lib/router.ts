/**
 * PaymentRouterFactory integration + stable public clients.
 *
 * Public clients are created once at module load (singletons) so they are
 * never re-instantiated on React re-renders. Components import EVM_CLIENTS
 * and call viem methods directly for router prediction and event watching.
 */

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { hashkeyMainnet, arcChain } from './chains'

// ─── Stable public clients ────────────────────────────────────────────────────
export const EVM_CLIENTS = {
  base:    createPublicClient({ chain: base,           transport: http('https://mainnet.base.org') }),
  hashkey: createPublicClient({ chain: hashkeyMainnet, transport: http('https://mainnet.hsk.xyz')  }),
  arc:     createPublicClient({ chain: arcChain,       transport: http('https://rpc.testnet.arc.network') }),
} as const

// ─── Factory addresses ────────────────────────────────────────────────────────
export const ROUTER_FACTORY: Partial<Record<'base' | 'hashkey' | 'arc', `0x${string}`>> = {
  base:    '0x9439D7f770B2AEBAD9d0D05f2C713F0dB6b812ba',
  hashkey: '0x9439D7f770B2AEBAD9d0D05f2C713F0dB6b812ba',
  arc:     '0x9439D7f770B2AEBAD9d0D05f2C713F0dB6b812ba',
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

/** Deployed PayLinkFactoryV2 address on Base mainnet. Set VITE_FACTORY_V2 in env. */
export const FACTORY_V2_ADDRESS = (import.meta.env.VITE_FACTORY_V2 ?? '') as `0x${string}`

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

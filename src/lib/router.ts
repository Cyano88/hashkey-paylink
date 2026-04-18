/**
 * PaymentRouterFactory integration.
 *
 * Workflow:
 *  1. cd contracts && npm install && cp .env.example .env
 *  2. Fill DEPLOYER_PRIVATE_KEY in contracts/.env
 *  3. npm run deploy:base  (then deploy:hashkey, deploy:arc)
 *  4. Paste the printed address into ROUTER_FACTORY below for that chain
 *  5. vercel --prod --yes
 *
 * Once a factory address is set, the payer sees the deterministic router
 * contract address instead of the raw recipient wallet. Any funds sent there
 * (even manually from Binance) are automatically split via PaymentRouter.
 */

// ─── Factory addresses — fill in after deploying each chain ──────────────────
export const ROUTER_FACTORY: Partial<Record<'base' | 'hashkey' | 'arc', `0x${string}`>> = {
  // base:    '0x...',   // npm run deploy:base
  // hashkey: '0x...',   // npm run deploy:hashkey
  // arc:     '0x...',   // npm run deploy:arc
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

/** Read-only: predict router address without deploying */
export const FACTORY_GET_ROUTER_ABI = [{
  name: 'getRouterAddress',
  type: 'function' as const,
  stateMutability: 'view' as const,
  inputs:  [{ name: 'recipient', type: 'address' }],
  outputs: [{ name: '',          type: 'address' }],
}] as const

/** Write: deploy router (idempotent) */
export const FACTORY_DEPLOY_ROUTER_ABI = [{
  name: 'deployRouter',
  type: 'function' as const,
  stateMutability: 'nonpayable' as const,
  inputs:  [{ name: 'recipient', type: 'address' }],
  outputs: [{ name: '',          type: 'address' }],
}] as const

/** PaymentRouted event emitted by each router on every successful split */
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

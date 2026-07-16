export const POCKET_COMMAND_KINDS = [
  'profile.save',
  'wallet.link',
  'wallet.unlink',
  'bank.verify',
  'pos.create',
  'bank-receive.create',
  'bank-send.create',
  'withdraw.evm',
  'withdraw.solana.prepare',
  'withdraw.solana.submit',
  'x402.wallet.connect.init',
  'x402.wallet.connect.complete',
  'x402.gateway.activate',
] as const

export type PocketCommandKind = typeof POCKET_COMMAND_KINDS[number]

export type PocketCommandPolicy = {
  transport: string
  action?: string
  transportAuth: 'none' | 'privy-bearer' | 'circle-wallet-session'
  idempotency: 'absent' | 'required'
  approval: 'form-submit' | 'wallet-signature' | 'signed-payload'
  risk: 'identity-write' | 'sensitive-data-write' | 'financial-write'
  execution: 'pocket-adapter' | 'circle-wallet-client'
}

export const POCKET_COMMAND_POLICIES = Object.freeze({
  'profile.save': {
    transport: '/api/pocket/profile',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'sensitive-data-write',
    execution: 'pocket-adapter',
  },
  'wallet.link': {
    transport: '/api/pocket/wallets/link',
    action: 'link',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'identity-write',
    execution: 'pocket-adapter',
  },
  'wallet.unlink': {
    transport: '/api/pocket/wallets/link',
    action: 'unlink',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'identity-write',
    execution: 'pocket-adapter',
  },
  'bank.verify': {
    transport: '/api/pocket/bank-receive/verify',
    transportAuth: 'privy-bearer',
    idempotency: 'absent',
    approval: 'form-submit',
    risk: 'sensitive-data-write',
    execution: 'pocket-adapter',
  },
  'pos.create': {
    transport: '/api/pocket/pos',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'financial-write',
    execution: 'pocket-adapter',
  },
  'bank-receive.create': {
    transport: '/api/pocket/bank-receive',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'financial-write',
    execution: 'pocket-adapter',
  },
  'bank-send.create': {
    transport: '/api/pocket/bank-send',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'financial-write',
    execution: 'pocket-adapter',
  },
  'withdraw.evm': {
    transport: 'executePocketEvmTransfer',
    transportAuth: 'circle-wallet-session',
    idempotency: 'absent',
    approval: 'wallet-signature',
    risk: 'financial-write',
    execution: 'circle-wallet-client',
  },
  'withdraw.solana.prepare': {
    transport: '/api/pocket/transfers/prepare',
    transportAuth: 'privy-bearer',
    idempotency: 'absent',
    approval: 'wallet-signature',
    risk: 'financial-write',
    execution: 'pocket-adapter',
  },
  'withdraw.solana.submit': {
    transport: '/api/pocket/transfers/submit',
    transportAuth: 'privy-bearer',
    idempotency: 'absent',
    approval: 'signed-payload',
    risk: 'financial-write',
    execution: 'pocket-adapter',
  },
  'x402.wallet.connect.init': {
    transport: '/api/pocket/x402/connect',
    action: 'init',
    transportAuth: 'privy-bearer',
    idempotency: 'absent',
    approval: 'form-submit',
    risk: 'identity-write',
    execution: 'pocket-adapter',
  },
  'x402.wallet.connect.complete': {
    transport: '/api/pocket/x402/connect',
    action: 'complete',
    transportAuth: 'privy-bearer',
    idempotency: 'absent',
    approval: 'form-submit',
    risk: 'identity-write',
    execution: 'pocket-adapter',
  },
  'x402.gateway.activate': {
    transport: '/api/pocket/x402/activate',
    transportAuth: 'privy-bearer',
    idempotency: 'required',
    approval: 'form-submit',
    risk: 'financial-write',
    execution: 'pocket-adapter',
  },
} satisfies Record<PocketCommandKind, PocketCommandPolicy>)

export function isPocketCommandKind(value: unknown): value is PocketCommandKind {
  return typeof value === 'string' && POCKET_COMMAND_KINDS.includes(value as PocketCommandKind)
}

export function pocketCommandPolicy(kind: PocketCommandKind): PocketCommandPolicy {
  return POCKET_COMMAND_POLICIES[kind]
}

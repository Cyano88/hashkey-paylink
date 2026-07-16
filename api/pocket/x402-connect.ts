import type { Request, Response } from 'express'
import {
  connectAgentWallet,
  type AgentWalletConnectionChoice,
  type AgentWalletConnectionFailure,
  type AgentWalletConnectionResult,
} from '../agent-wallet.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import { pocketX402WalletSlug } from '../../src/pocket/lib/pocketX402Identity.js'
import type { PocketErrorCode } from '../../src/pocket/lib/pocketSchemas.js'

type PocketX402ConnectDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  connect(input: {
    action: 'init' | 'complete'
    agentSlug: string
    email: string
    network: 'base' | 'arc'
    otp?: string
    expectedWallet?: string
  }): Promise<AgentWalletConnectionResult>
}

function safeChoices(value: unknown): AgentWalletConnectionChoice[] | undefined {
  if (!Array.isArray(value)) return undefined
  const choices = value.slice(0, 8).flatMap(choice => {
    if (!choice || typeof choice !== 'object') return []
    const row = choice as Record<string, unknown>
    if (typeof row.address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(row.address)) return []
    return [{
      address: row.address,
      ...(typeof row.balance === 'string' && /^\d+(?:\.\d+)?$/.test(row.balance) ? { balance: row.balance } : {}),
      ...(row.balanceError !== undefined ? { balanceError: 'Balance unavailable' } : {}),
    }]
  })
  return choices.length ? choices : undefined
}

export function createPocketX402ConnectHandler(dependencies: PocketX402ConnectDependencies) {
  return async function pocketX402ConnectHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, reason?: string, walletChoices?: AgentWalletConnectionChoice[]) {
      return res.status(status).json({
        ok: false,
        error: { code, message, retryable },
        ...(reason ? { reason } : {}),
        ...(walletChoices?.length ? { walletChoices } : {}),
      })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    const action = req.body?.action
    if (action !== 'init' && action !== 'complete') return fail(400, 'VALIDATION_FAILED', 'Connection action must be init or complete.', false)
    const network = req.body?.network
    if (network !== 'base' && network !== 'arc') return fail(400, 'VALIDATION_FAILED', 'x402 network must be base or arc.', false)
    if (req.body?.email !== undefined || req.body?.agentSlug !== undefined) {
      return fail(400, 'VALIDATION_FAILED', 'Wallet identity is derived from the authenticated session.', false)
    }

    try {
      const identity = await dependencies.verifyUser(req)
      const email = identity.email?.trim().toLowerCase() ?? ''
      const agentSlug = pocketX402WalletSlug(email)
      if (!agentSlug) return fail(403, 'FORBIDDEN', 'A verified email is required for the x402 wallet.', false)
      const result = await dependencies.connect({
        action,
        agentSlug,
        email,
        network,
        ...(typeof req.body?.otp === 'string' ? { otp: req.body.otp } : {}),
        ...(typeof req.body?.expectedWallet === 'string' ? { expectedWallet: req.body.expectedWallet } : {}),
      })
      return res.json({ ok: true, ...result })
    } catch (error) {
      const normalized = error as AgentWalletConnectionFailure
      const status = normalized.status ?? 500
      const reason = typeof normalized.code === 'string' ? normalized.code.slice(0, 80) : undefined
      const walletChoices = safeChoices(normalized.walletChoices)
      if (status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false, reason)
      if (status === 403) return fail(403, 'FORBIDDEN', normalized.message, false, reason)
      if (status === 400) return fail(400, 'VALIDATION_FAILED', normalized.message, false, reason, walletChoices)
      if (status === 409) return fail(409, 'VERSION_CONFLICT', normalized.message, false, reason, walletChoices)
      if (status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true, reason)
      return fail(status === 502 ? 502 : 503, 'PROVIDER_UNAVAILABLE', 'Circle wallet connection is temporarily unavailable.', true, reason)
    }
  }
}

export default createPocketX402ConnectHandler({
  verifyUser: verifiedPrivyUser,
  connect: connectAgentWallet,
})

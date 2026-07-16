import type { Request, Response } from 'express'
import {
  readAgentWalletSnapshot,
  type AgentWalletReadSnapshot,
} from '../agent-wallet.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import { pocketX402WalletSlug } from '../../src/pocket/lib/pocketX402Identity.js'
import type { PocketErrorCode } from '../../src/pocket/lib/pocketSchemas.js'

type PocketX402HandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readSnapshot(input: { agentSlug: string; network: 'base' | 'arc' }): Promise<AgentWalletReadSnapshot>
}

function requestedNetwork(value: unknown): 'base' | 'arc' | null {
  if (value === undefined || value === '' || value === 'base') return 'base'
  if (value === 'arc') return 'arc'
  return null
}

export function createPocketX402Handler(dependencies: PocketX402HandlerDependencies) {
  return async function pocketX402Handler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'GET') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    const network = requestedNetwork(req.query?.network)
    if (!network) return fail(400, 'VALIDATION_FAILED', 'x402 network must be base or arc.', false)

    try {
      const identity = await dependencies.verifyUser(req)
      const agentSlug = pocketX402WalletSlug(identity.email ?? '')
      if (!agentSlug) return fail(403, 'FORBIDDEN', 'A verified email is required for the x402 wallet.', false)
      const snapshot = await dependencies.readSnapshot({ agentSlug, network })
      return res.json({ ok: true, snapshot })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', 'x402 wallet status is temporarily unavailable.', true)
      return fail(500, 'INTERNAL_ERROR', 'x402 wallet status is temporarily unavailable.', true)
    }
  }
}

export default createPocketX402Handler({
  verifyUser: verifiedPrivyUser,
  readSnapshot: readAgentWalletSnapshot,
})

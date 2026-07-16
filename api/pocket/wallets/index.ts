import type { Request, Response } from 'express'
import {
  circleLinkKey,
  readCircleLink,
  verifiedPrivyUser,
  type CircleLinkRecord,
  type VerifiedLinkUser,
} from '../../privy-circle-link.js'
import {
  POCKET_NETWORKS,
  type PocketErrorCode,
  type PocketNetwork,
  type PocketWalletLinkRecord,
} from '../../../src/pocket/lib/pocketSchemas.js'

type PocketWalletsHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readLink(key: string): Promise<CircleLinkRecord | null>
}

function sanitizedLink(link: CircleLinkRecord): PocketWalletLinkRecord {
  return {
    network: link.chain,
    wallet: {
      id: link.circleWalletId,
      address: link.circleWalletAddress,
      blockchain: link.circleBlockchain,
    },
    updatedAt: link.updatedAt,
  }
}

export function createPocketWalletsHandler(dependencies: PocketWalletsHandlerDependencies) {
  return async function pocketWalletsHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'GET') {
      return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    }

    try {
      const identity = await dependencies.verifyUser(req)
      const entries = await Promise.all(POCKET_NETWORKS.map(async network => {
        const link = await dependencies.readLink(circleLinkKey(identity.userId, network, 'payment'))
        if (!link) return null
        if (link.chain !== network || (link.purpose ?? 'payment') !== 'payment') {
          throw Object.assign(new Error('Stored Circle wallet link did not match its payment network.'), { status: 500 })
        }
        return [network, sanitizedLink(link)] as const
      }))
      const wallets = entries.reduce<Partial<Record<PocketNetwork, PocketWalletLinkRecord>>>((result, entry) => {
        if (entry) result[entry[0]] = entry[1]
        return result
      }, {})
      return res.json({ ok: true, wallets })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Circle wallet read failed.', true)
    }
  }
}

export default createPocketWalletsHandler({
  verifyUser: verifiedPrivyUser,
  readLink: readCircleLink,
})

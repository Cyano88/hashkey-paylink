import type { Request, Response } from 'express'
import {
  CircleLinkVersionConflictError,
  circleLinkKey,
  compareAndDeleteCircleLink,
  compareAndSetCircleLink,
  verifiedPrivyUser,
  verifyCircleLinkWallet,
  type CircleLinkMutationResult,
  type CircleLinkRecord,
  type CircleLinkWallet,
  type VerifiedLinkUser,
} from '../../privy-circle-link.js'
import {
  isPocketIdempotencyKey,
  isPocketWalletLinkMutationRequest,
  type PocketErrorCode,
  type PocketWalletLinkMutationData,
} from '../../../src/pocket/lib/pocketSchemas.js'

type PocketWalletLinkHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  verifyWallet(input: {
    userToken: string
    chain: CircleLinkRecord['chain']
    wallet: CircleLinkWallet
  }): Promise<void>
  setLink(key: string, candidate: CircleLinkRecord, expectedUpdatedAt?: number): Promise<CircleLinkMutationResult>
  deleteLink(key: string, expectedUpdatedAt?: number): Promise<CircleLinkMutationResult>
  requestId?: () => string
}

function mutationData(result: CircleLinkMutationResult): PocketWalletLinkMutationData {
  return {
    link: result.link ? {
      network: result.link.chain,
      wallet: {
        id: result.link.circleWalletId,
        address: result.link.circleWalletAddress,
        blockchain: result.link.circleBlockchain,
      },
      updatedAt: result.link.updatedAt,
    } : null,
    unchanged: result.unchanged,
  }
}

async function verifyOwnedWallet(
  dependencies: PocketWalletLinkHandlerDependencies,
  input: Parameters<PocketWalletLinkHandlerDependencies['verifyWallet']>[0],
) {
  try {
    await dependencies.verifyWallet(input)
  } catch (error) {
    const normalized = error as Error & { status?: number }
    if (normalized.status === 403 || normalized.status === 429 || (normalized.status ?? 0) >= 500) throw normalized
    if ((normalized.status ?? 0) >= 400 && (normalized.status ?? 0) < 500) {
      throw Object.assign(new Error('Circle wallet session could not verify this wallet.'), { status: 403 })
    }
    throw Object.assign(new Error('Circle wallet ownership verification is temporarily unavailable.'), { status: 503 })
  }
}

export function createPocketWalletLinkHandler(dependencies: PocketWalletLinkHandlerDependencies) {
  return async function pocketWalletLinkHandler(req: Request, res: Response) {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    const rawIdempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()

    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey)
          ? rawIdempotencyKey
          : 'pocket:wallet-link:invalid-request',
        status: 'failed',
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'POST') {
      return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    }

    try {
      const identity = await dependencies.verifyUser(req)
      if (!isPocketIdempotencyKey(rawIdempotencyKey)) {
        return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false, 'idempotencyKey')
      }
      if (!isPocketWalletLinkMutationRequest(req.body)) {
        return fail(400, 'VALIDATION_FAILED', 'Enter a valid Circle wallet link request.', false, 'walletLink')
      }

      const key = circleLinkKey(identity.userId, req.body.network, 'payment')
      let result: CircleLinkMutationResult

      if (req.body.action === 'unlink') {
        result = await dependencies.deleteLink(key, req.body.expectedUpdatedAt)
      } else {
        const wallet: CircleLinkWallet = {
          id: req.body.wallet.id.trim(),
          address: req.body.wallet.address.trim(),
          blockchain: req.body.wallet.blockchain.trim().toUpperCase(),
        }
        await verifyOwnedWallet(dependencies, {
          userToken: req.body.circleUserToken,
          chain: req.body.network,
          wallet,
        })
        result = await dependencies.setLink(key, {
          privyUserId: identity.userId,
          email: identity.email,
          chain: req.body.network,
          purpose: 'payment',
          circleWalletId: wallet.id,
          circleWalletAddress: wallet.address,
          circleBlockchain: wallet.blockchain,
          updatedAt: 0,
        }, req.body.expectedUpdatedAt)
      }

      return res.json({
        ok: true,
        requestId,
        idempotencyKey: rawIdempotencyKey,
        status: 'completed',
        data: mutationData(result),
      })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized instanceof CircleLinkVersionConflictError || normalized.status === 409) {
        return fail(409, 'VERSION_CONFLICT', normalized.message, false)
      }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Circle wallet link request failed.', true)
    }
  }
}

export default createPocketWalletLinkHandler({
  verifyUser: verifiedPrivyUser,
  verifyWallet: verifyCircleLinkWallet,
  setLink: compareAndSetCircleLink,
  deleteLink: compareAndDeleteCircleLink,
})

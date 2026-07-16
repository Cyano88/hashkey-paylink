import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import {
  activateAgentGateway,
  type AgentGatewayActivationResult,
  type AgentWalletConnectionFailure,
} from '../agent-wallet.js'
import {
  claimCirclePocketAction,
  recordCirclePocketAction,
  type CirclePocketActionRecord,
} from '../circle-pocket-action-journal.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import { pocketX402WalletSlug } from '../../src/pocket/lib/pocketX402Identity.js'
import {
  isPocketIdempotencyKey,
  isPocketX402ActivationRequest,
  type PocketErrorCode,
  type PocketX402ActivationData,
} from '../../src/pocket/lib/pocketSchemas.js'

type PocketX402ActivateDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  claim(input: { ownerId: string; idempotencyKey: string; action: string; metadata: Record<string, string> }): Promise<{ record: CirclePocketActionRecord; claimed: boolean }>
  record(input: { ownerId: string; idempotencyKey: string; action: string; status: 'completed' | 'failed'; metadata: Record<string, string> }): Promise<CirclePocketActionRecord>
  activate(input: { agentSlug: string; network: 'base' | 'arc'; amount: string }): Promise<AgentGatewayActivationResult>
  requestId?: () => string
}

const ACTION = 'x402.gateway.activate'

function replayData(record: CirclePocketActionRecord): PocketX402ActivationData | null {
  const metadata = record.metadata
  if (!metadata) return null
  if (metadata.activationStatus !== 'available' && metadata.activationStatus !== 'pending') return null
  if (metadata.network !== 'base' && metadata.network !== 'arc') return null
  if (!/^\d+(?:\.\d{1,6})?$/.test(metadata.amount ?? '')) return null
  if (!/^0x[a-fA-F0-9]{40}$/.test(metadata.walletAddress ?? '')) return null
  if (!/^\d+(?:\.\d+)?$/.test(metadata.gatewayBalance ?? '')) return null
  return {
    activationStatus: metadata.activationStatus,
    amount: metadata.amount,
    network: metadata.network,
    walletAddress: metadata.walletAddress,
    gatewayBalance: metadata.gatewayBalance,
    replayed: true,
  }
}

export function createPocketX402ActivateHandler(dependencies: PocketX402ActivateDependencies) {
  return async function pocketX402ActivateHandler(req: Request, res: Response) {
    const rawKey = String(req.headers['idempotency-key'] ?? '').trim()
    let requestId = dependencies.requestId?.() ?? crypto.randomUUID()

    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawKey) ? rawKey : 'pocket:x402-activate:invalid-request',
        status: 'failed',
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    if (!isPocketIdempotencyKey(rawKey)) return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false, 'idempotencyKey')
    if (!isPocketX402ActivationRequest(req.body)) return fail(400, 'VALIDATION_FAILED', 'x402 activation must be between 0.5 and 5 USDC on Base or Arc.', false, 'activation')

    let ownerId = ''
    try {
      const identity = await dependencies.verifyUser(req)
      ownerId = identity.userId
      const agentSlug = pocketX402WalletSlug(identity.email ?? '')
      if (!agentSlug) return fail(403, 'FORBIDDEN', 'A verified email is required for x402 activation.', false)
      const claim = await dependencies.claim({
        ownerId,
        idempotencyKey: rawKey,
        action: ACTION,
        metadata: { network: req.body.network, amount: req.body.amount },
      })
      requestId = claim.record.id
      if (!claim.claimed) {
        if (claim.record.metadata?.network !== req.body.network || claim.record.metadata?.amount !== req.body.amount) {
          return fail(409, 'DUPLICATE_REQUEST', 'This Idempotency-Key was already used for another x402 activation.', false)
        }
        const data = replayData(claim.record)
        if (claim.record.status === 'completed' && data) {
          return res.status(data.activationStatus === 'pending' ? 202 : 200).json({
            ok: true,
            requestId,
            idempotencyKey: rawKey,
            status: data.activationStatus === 'pending' ? 'processing' : 'completed',
            data,
          })
        }
        if (claim.record.status === 'started') {
          return res.status(202).json({
            ok: true,
            requestId,
            idempotencyKey: rawKey,
            status: 'processing',
          })
        }
        return fail(409, 'DUPLICATE_REQUEST', 'This activation attempt already failed. Check the Gateway balance before starting a new attempt.', false)
      }

      const result = await dependencies.activate({ agentSlug, network: req.body.network, amount: req.body.amount })
      const data: PocketX402ActivationData = {
        activationStatus: result.status,
        amount: result.amount,
        network: result.network,
        walletAddress: result.walletAddress,
        gatewayBalance: result.gatewayBalance,
        replayed: false,
      }
      await dependencies.record({
        ownerId,
        idempotencyKey: rawKey,
        action: ACTION,
        status: 'completed',
        metadata: {
          network: data.network,
          amount: data.amount,
          activationStatus: data.activationStatus,
          walletAddress: data.walletAddress,
          gatewayBalance: data.gatewayBalance,
        },
      })
      return res.status(data.activationStatus === 'pending' ? 202 : 200).json({
        ok: true,
        requestId,
        idempotencyKey: rawKey,
        status: data.activationStatus === 'pending' ? 'processing' : 'completed',
        data,
      })
    } catch (error) {
      const normalized = error as AgentWalletConnectionFailure
      if (ownerId) {
        await dependencies.record({
          ownerId,
          idempotencyKey: rawKey,
          action: ACTION,
          status: 'failed',
          metadata: { network: req.body.network, amount: req.body.amount },
        }).catch(() => undefined)
      }
      if (normalized.status === 400) return fail(400, 'VALIDATION_FAILED', normalized.message, false)
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 404) return fail(404, 'RESOURCE_NOT_FOUND', normalized.message, false)
      if (normalized.status === 409) return fail(409, normalized.code === 'circle_session_expired' ? 'SESSION_EXPIRED' : 'VERSION_CONFLICT', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      return fail(503, 'PROVIDER_UNAVAILABLE', 'Circle Gateway activation is temporarily unavailable.', true)
    }
  }
}

export default createPocketX402ActivateHandler({
  verifyUser: verifiedPrivyUser,
  claim: claimCirclePocketAction,
  record: recordCirclePocketAction,
  activate: activateAgentGateway,
})

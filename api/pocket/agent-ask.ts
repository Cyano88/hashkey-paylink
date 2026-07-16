import type { Request, Response } from 'express'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import {
  isCirclePocketAgentRequest,
  type CirclePocketAgentResponse,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'
import { routeCirclePocketQuestion } from './agent-router.js'

type PocketAgentAskDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
}

export function createPocketAgentAskHandler(dependencies: PocketAgentAskDependencies) {
  return async function pocketAgentAskHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    if (!isCirclePocketAgentRequest(req.body)) {
      return fail(400, 'VALIDATION_FAILED', 'Circle Pocket assistant request was invalid.', false)
    }
    if (req.body.identityToken !== undefined) {
      return fail(400, 'VALIDATION_FAILED', 'Send the Circle Pocket session token in the Authorization header.', false)
    }
    if (req.body.draft !== undefined || req.body.confirmationId !== undefined) {
      return fail(400, 'VALIDATION_FAILED', 'Assistant mutations are not available on this read-only endpoint.', false)
    }

    try {
      await dependencies.verifyUser(req)
      const route = routeCirclePocketQuestion(req.body.message, 'circle-pocket')
      if (!route) return fail(500, 'INTERNAL_ERROR', 'Circle Pocket routing failed.', true)

      const response: CirclePocketAgentResponse = {
        answer: route.answer,
        intent: route.supported
          ? `circle-pocket-${route.capability}`
          : 'circle-pocket-closest-assistance',
        actions: [{ id: route.capability, label: route.action.label, href: route.action.url, style: 'primary' }],
        proof: {
          source: route.source,
          capability: route.capability,
          supported: route.supported,
          confidence: route.confidence,
          readOnly: true,
        },
      }
      return res.json(response)
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', 'Circle Pocket assistant is temporarily unavailable.', true)
      return fail(500, 'INTERNAL_ERROR', 'Circle Pocket assistant is temporarily unavailable.', true)
    }
  }
}

export default createPocketAgentAskHandler({ verifyUser: verifiedPrivyUser })

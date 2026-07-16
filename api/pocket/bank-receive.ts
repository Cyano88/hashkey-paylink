import type { Request, Response } from 'express'
import { createNgPosBankReceive } from '../ng-pos.js'
import {
  isPocketBankReceiveCreateRequest,
  isPocketBankReceiveLink,
  isPocketIdempotencyKey,
  type PocketBankReceiveCreateData,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'

type LegacyBankReceiveResult = {
  link?: unknown
  replayed?: unknown
}

type PocketBankReceiveHandlerDependencies = {
  createBankReceive(req: Request, body: Record<string, unknown>): Promise<LegacyBankReceiveResult>
  requestId?: () => string
}

export function createPocketBankReceiveHandler(dependencies: PocketBankReceiveHandlerDependencies) {
  return async function pocketBankReceiveHandler(req: Request, res: Response) {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    const rawIdempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()

    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey)
          ? rawIdempotencyKey
          : 'pocket:bank-receive:invalid-request',
        status: 'failed',
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    if (!isPocketIdempotencyKey(rawIdempotencyKey)) {
      return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false, 'idempotencyKey')
    }
    if (!isPocketBankReceiveCreateRequest(req.body)) {
      return fail(400, 'VALIDATION_FAILED', 'Enter a valid bank receive link request.', false, 'bankReceive')
    }

    try {
      const result = await dependencies.createBankReceive(req, req.body)
      if (!isPocketBankReceiveLink(result.link)) {
        throw Object.assign(new Error('Bank receive provider returned an invalid link.'), { status: 502 })
      }
      const data: PocketBankReceiveCreateData = {
        link: result.link,
        replayed: result.replayed === true,
      }
      return res.json({
        ok: true,
        requestId,
        idempotencyKey: rawIdempotencyKey,
        status: 'completed',
        data,
      })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 400) return fail(400, 'VALIDATION_FAILED', normalized.message, false)
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 404) return fail(404, 'RESOURCE_NOT_FOUND', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'ACTION_FAILED', normalized.message || 'Could not create bank receive link.', true)
    }
  }
}

export default createPocketBankReceiveHandler({
  createBankReceive: createNgPosBankReceive,
})

import type { Request, Response } from 'express'
import { createNgPosMerchant } from '../ng-pos.js'
import {
  isPocketIdempotencyKey,
  isPocketPosCreateRequest,
  isPocketPosMerchant,
  type PocketErrorCode,
  type PocketPosCreateData,
} from '../../src/pocket/lib/pocketSchemas.js'

type LegacyPosResult = {
  merchant?: unknown
  replayed?: unknown
}

type PocketPosHandlerDependencies = {
  createMerchant(req: Request, body: Record<string, unknown>): Promise<LegacyPosResult>
  requestId?: () => string
}

export function createPocketPosHandler(dependencies: PocketPosHandlerDependencies) {
  return async function pocketPosHandler(req: Request, res: Response) {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    const rawIdempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()

    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey)
          ? rawIdempotencyKey
          : 'pocket:pos-create:invalid-request',
        status: 'failed',
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    if (!isPocketIdempotencyKey(rawIdempotencyKey)) {
      return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false, 'idempotencyKey')
    }
    if (!isPocketPosCreateRequest(req.body)) {
      return fail(400, 'VALIDATION_FAILED', 'Enter a valid POS terminal request.', false, 'pos')
    }

    try {
      const result = await dependencies.createMerchant(req, req.body)
      if (!isPocketPosMerchant(result.merchant)) {
        throw Object.assign(new Error('POS provider returned an invalid merchant.'), { status: 502 })
      }
      const data: PocketPosCreateData = {
        merchant: result.merchant,
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
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'ACTION_FAILED', normalized.message || 'POS setup failed.', true)
    }
  }
}

export default createPocketPosHandler({
  createMerchant: createNgPosMerchant,
})

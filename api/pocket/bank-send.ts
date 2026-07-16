import type { Request, Response } from 'express'
import { createNgPosBankSend } from '../ng-pos.js'
import {
  isPocketBankSendCreateRequest,
  isPocketBankSendLink,
  isPocketIdempotencyKey,
  type PocketBankSendCreateData,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'

type LegacyBankSendResult = {
  link?: unknown
  replayed?: unknown
}

type PocketBankSendHandlerDependencies = {
  createBankSend(req: Request, body: Record<string, unknown>): Promise<LegacyBankSendResult>
  requestId?: () => string
}

export function createPocketBankSendHandler(dependencies: PocketBankSendHandlerDependencies) {
  return async function pocketBankSendHandler(req: Request, res: Response) {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    const rawIdempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()

    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey)
          ? rawIdempotencyKey
          : 'pocket:bank-send:invalid-request',
        status: 'failed',
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    if (!isPocketIdempotencyKey(rawIdempotencyKey)) {
      return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false, 'idempotencyKey')
    }
    if (!isPocketBankSendCreateRequest(req.body)) {
      return fail(400, 'VALIDATION_FAILED', 'Enter a valid bank-to-USDC link request.', false, 'bankSend')
    }

    try {
      const result = await dependencies.createBankSend(req, req.body)
      if (!isPocketBankSendLink(result.link)) {
        throw Object.assign(new Error('Bank-to-USDC provider returned an invalid link.'), { status: 502 })
      }
      const data: PocketBankSendCreateData = {
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
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'ACTION_FAILED', normalized.message || 'Could not create bank-to-USDC link.', true)
    }
  }
}

export default createPocketBankSendHandler({
  createBankSend: createNgPosBankSend,
})

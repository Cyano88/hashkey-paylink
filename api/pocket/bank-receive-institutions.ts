import type { Request, Response } from 'express'
import { listNgPosInstitutions } from '../ng-pos.js'
import {
  isPocketBankInstitutionsData,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'

type PocketBankInstitutionsHandlerDependencies = {
  listInstitutions(currency: string): Promise<unknown>
}

export function createPocketBankInstitutionsHandler(dependencies: PocketBankInstitutionsHandlerDependencies) {
  return async function pocketBankInstitutionsHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'GET') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)

    try {
      const data = { institutions: await dependencies.listInstitutions('NGN') }
      if (!isPocketBankInstitutionsData(data)) {
        throw Object.assign(new Error('Bank provider returned an invalid institution list.'), { status: 502 })
      }
      return res.json({ ok: true, ...data })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 400) return fail(400, 'PROVIDER_UNAVAILABLE', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Could not load banks.', true)
    }
  }
}

export default createPocketBankInstitutionsHandler({
  listInstitutions: listNgPosInstitutions,
})

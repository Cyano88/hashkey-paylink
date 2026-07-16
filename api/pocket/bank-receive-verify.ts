import type { Request, Response } from 'express'
import { verifyNgPosBankAccount } from '../ng-pos.js'
import {
  verifiedPrivyUser,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import {
  isPocketBankVerifyData,
  isPocketBankVerifyRequest,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'

type PocketBankVerifyHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  verifyAccount(body: Record<string, unknown>): Promise<unknown>
}

export function createPocketBankVerifyHandler(dependencies: PocketBankVerifyHandlerDependencies) {
  return async function pocketBankVerifyHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)

    try {
      await dependencies.verifyUser(req)
      if (!isPocketBankVerifyRequest(req.body)) {
        return fail(400, 'VALIDATION_FAILED', 'Enter a valid bank and 10-digit account number.', false, 'bankAccount')
      }
      const data = await dependencies.verifyAccount(req.body)
      if (!isPocketBankVerifyData(data)) {
        throw Object.assign(new Error('Bank provider returned an invalid verification result.'), { status: 502 })
      }
      return res.json({ ok: true, ...data })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 400) return fail(400, 'VALIDATION_FAILED', normalized.message, false, 'bankAccount')
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Account verification failed.', true)
    }
  }
}

export default createPocketBankVerifyHandler({
  verifyUser: verifiedPrivyUser,
  verifyAccount: verifyNgPosBankAccount,
})

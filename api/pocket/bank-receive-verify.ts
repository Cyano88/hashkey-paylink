import type { Request, Response } from 'express'
import { verifyNgPosBankAccount } from '../ng-pos.js'
import {
  localCurrencyProfileRepository,
  ProfileNameConflictError,
  verifiedPrivyUser,
  type ProfileRepository,
  type VerifiedProfileUser,
} from '../local-currency-profile.js'
import {
  isPocketBankVerifyData,
  isPocketBankVerifyRequest,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'

type PocketBankVerifyHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedProfileUser>
  verifyAccount(body: Record<string, unknown>): Promise<unknown>
  repository?: ProfileRepository
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
      const identity = await dependencies.verifyUser(req)
      if (!isPocketBankVerifyRequest(req.body)) {
        return fail(400, 'VALIDATION_FAILED', 'Enter a valid bank and 10-digit account number.', false, 'bankAccount')
      }
      const data = await dependencies.verifyAccount(req.body)
      if (!isPocketBankVerifyData(data)) {
        throw Object.assign(new Error('Bank provider returned an invalid verification result.'), { status: 502 })
      }
      // Resolving a payout account is not consent to lock the user's identity.
      // Profile enrollment repeats provider verification with an explicit flag.
      if (req.body.confirm_profile_name === true) {
        await dependencies.repository?.bindBankResolvedName(identity, data.account_name)
      }
      return res.json({ ok: true, ...data })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 400) return fail(400, 'VALIDATION_FAILED', normalized.message, false, 'bankAccount')
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized instanceof ProfileNameConflictError || normalized.status === 409) return fail(409, 'VERSION_CONFLICT', normalized.message, false, 'bankAccount')
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Account verification failed.', true)
    }
  }
}

export default createPocketBankVerifyHandler({
  verifyUser: verifiedPrivyUser,
  verifyAccount: verifyNgPosBankAccount,
  repository: localCurrencyProfileRepository,
})

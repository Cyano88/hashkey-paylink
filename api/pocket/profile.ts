import type { Request, Response } from 'express'
import {
  PocketIdUnavailableError,
  ProfileVersionConflictError,
  localCurrencyProfileRepository,
  verifiedPrivyUser,
  type ProfileRepository,
  type VerifiedProfileUser,
} from '../local-currency-profile.js'
import {
  isPocketIdempotencyKey,
  isPocketProfileUpsertRequest,
  type PocketErrorCode,
  type PocketProfileUpsertData,
} from '../../src/pocket/lib/pocketSchemas.js'

type PocketProfileHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedProfileUser>
  repository: ProfileRepository
  requestId?: () => string
}

function profileData(profile: Awaited<ReturnType<ProfileRepository['ensure']>>['profile'], unchanged: boolean): PocketProfileUpsertData {
  return {
    profile: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      resolvedName: profile.resolvedName,
      nameStatus: profile.nameStatus,
      email: profile.email,
      pocketNumber: profile.pocketNumber,
      pocketId: profile.pocketId,
      avatarId: profile.avatarId,
      displayCurrency: profile.displayCurrency,
      updatedAt: profile.updatedAt,
    },
    unchanged,
  }
}

export function createPocketProfileHandler(dependencies: PocketProfileHandlerDependencies) {
  return async function pocketProfileHandler(req: Request, res: Response) {
    const requestId = dependencies.requestId?.() ?? crypto.randomUUID()
    const rawIdempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()

    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
      return res.status(status).json({
        ok: false,
        requestId,
        idempotencyKey: isPocketIdempotencyKey(rawIdempotencyKey)
          ? rawIdempotencyKey
          : 'pocket:profile:invalid-request',
        status: 'failed',
        error: { code, message, retryable, ...(field ? { field } : {}) },
      })
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    }

    try {
      const identity = await dependencies.verifyUser(req)

      if (req.method === 'GET') {
        const ensured = await dependencies.repository.ensure(identity)
        return res.json({ ok: true, email: ensured.profile.email, profile: ensured.profile })
      }

      if (!isPocketIdempotencyKey(rawIdempotencyKey)) {
        return fail(400, 'VALIDATION_FAILED', 'A valid Idempotency-Key header is required.', false, 'idempotencyKey')
      }
      if (!isPocketProfileUpsertRequest(req.body)) {
        return fail(400, 'VALIDATION_FAILED', 'Pocket ID must contain 6 to 12 digits.', false, 'pocketId')
      }

      const current = await dependencies.repository.ensure(identity)
      const saved = await dependencies.repository.updateProfile(identity.userId, req.body.pocketId, req.body.avatarId ?? current.profile.avatarId, req.body.expectedUpdatedAt, req.body.displayCurrency ?? current.profile.displayCurrency)

      return res.json({
        ok: true,
        requestId,
        idempotencyKey: rawIdempotencyKey,
        status: 'completed',
        data: profileData(saved.profile, saved.unchanged),
      })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized instanceof PocketIdUnavailableError) {
        return fail(409, 'VERSION_CONFLICT', normalized.message, false, 'pocketId')
      }
      if (normalized instanceof ProfileVersionConflictError || normalized.status === 409) {
        return fail(409, 'VERSION_CONFLICT', normalized.message, false)
      }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 503) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Profile request failed.', true)
    }
  }
}

export default createPocketProfileHandler({
  verifyUser: verifiedPrivyUser,
  repository: localCurrencyProfileRepository,
})

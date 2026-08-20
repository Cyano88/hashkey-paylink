import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { verifiedPrivyUser, localCurrencyProfileRepository, type VerifiedProfileUser } from '../local-currency-profile.js'
import { deleteCircleLinksForPrivyUser } from '../privy-circle-link.js'
import { deleteHelperProfile } from '../helper-profile.js'
import { circlePocketIdentityId, type CirclePocketIdentity } from '../circle-pocket-identity.js'
import { unregisterAllPocketPushDevices } from './push-devices.js'
import { deletePocketPaymentSecurity } from './payment-security.js'
import { redactPocketSupportCases } from './support-cases.js'

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedProfileUser>
  deleteProfile(userId: string): Promise<unknown>
  deleteCircleLinks(userId: string): Promise<unknown>
  deletePushDevices(userId: string): Promise<unknown>
  deletePaymentSecurity(userId: string): Promise<unknown>
  deleteHelper(identity: CirclePocketIdentity): Promise<unknown>
  redactSupport(profileId: string): Promise<unknown>
  deleteIdentity(userId: string): Promise<unknown>
}

export const POCKET_ACCOUNT_RETAINED_CATEGORIES = [
  'Transaction, payout, bill, receipt, reconciliation, dispute, fraud-prevention, security, and accounting records where required.',
  'Public blockchain records, which cannot be erased by Pocket.',
]

function privyClient() {
  const appId = String(process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID ?? '').trim()
  const secret = String(process.env.PRIVY_APP_SECRET ?? '').trim()
  if (!appId || !secret) throw Object.assign(new Error('Pocket account deletion is not configured.'), { status: 503 })
  return new PrivyClient(appId, secret)
}

export function createPocketAccountHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    verifyUser: verifiedPrivyUser,
    deleteProfile: userId => localCurrencyProfileRepository.deleteProfile(userId),
    deleteCircleLinks: deleteCircleLinksForPrivyUser,
    deletePushDevices: unregisterAllPocketPushDevices,
    deletePaymentSecurity: deletePocketPaymentSecurity,
    deleteHelper: deleteHelperProfile,
    redactSupport: redactPocketSupportCases,
    deleteIdentity: userId => privyClient().deleteUser(userId),
    ...overrides,
  }
  return async function pocketAccountHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    if (req.method !== 'DELETE') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    try {
      const identity = await dependencies.verifyUser(req)
      if (String(req.body?.confirmation ?? '') !== 'DELETE') {
        return res.status(400).json({ ok: false, error: 'Type DELETE to confirm permanent account deletion.' })
      }
      const pocketIdentity: CirclePocketIdentity = { kind: 'privy', storageKey: 'privy:' + identity.userId, subject: identity.userId }
      const profileId = circlePocketIdentityId(pocketIdentity)

      // Privy is deleted last so a transient app-storage failure cannot remove
      // the user's ability to sign in and retry the deletion.
      await dependencies.deletePushDevices(identity.userId)
      await dependencies.deletePaymentSecurity(identity.userId)
      await dependencies.deleteCircleLinks(identity.userId)
      await dependencies.deleteHelper(pocketIdentity)
      await dependencies.redactSupport(profileId)
      await dependencies.deleteProfile(identity.userId)
      await dependencies.deleteIdentity(identity.userId)

      return res.json({ ok: true, status: 'deleted', retainedCategories: POCKET_ACCOUNT_RETAINED_CATEGORIES })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      const status = error.status === 401 || error.status === 403 ? error.status : 503
      return res.status(status).json({
        ok: false,
        error: status === 503
          ? 'Pocket could not complete account deletion. Your account is still accessible; please try again.'
          : error.message,
      })
    }
  }
}

export default createPocketAccountHandler()

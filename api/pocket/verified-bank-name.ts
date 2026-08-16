import type { Request } from 'express'
import { localCurrencyProfileRepository, verifiedPrivyUser, type ProfileRepository, type VerifiedProfileUser } from '../local-currency-profile.js'
import { verifyNgPosBankAccount } from '../ng-pos.js'
import { isPocketBankVerifyData } from '../../src/pocket/lib/pocketSchemas.js'

export function normalizeBankLegalName(value: unknown) {
  return String(value ?? '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

export type VerifiedBankNameDependencies = {
  verifyUser(req: Request): Promise<VerifiedProfileUser>
  profiles: ProfileRepository
  verifyAccount(body: Record<string, unknown>): Promise<unknown>
}

async function verifyPocketBankAccount(
  req: Request,
  body: Record<string, unknown>,
  dependencies: VerifiedBankNameDependencies,
) {
  const identity = await dependencies.verifyUser(req)
  const profile = await dependencies.profiles.get(identity.userId)
  if (profile?.nameStatus !== 'bank_resolved' || !profile.resolvedName) {
    throw Object.assign(new Error('Link your bank-verified name from Profile first.'), { status: 403 })
  }
  const verification = await dependencies.verifyAccount(body)
  if (!isPocketBankVerifyData(verification)) {
    throw Object.assign(new Error('Bank provider returned an invalid verification result.'), { status: 502 })
  }
  return { identity, profile, verification }
}

const defaultDependencies: VerifiedBankNameDependencies = {
  verifyUser: verifiedPrivyUser,
  profiles: localCurrencyProfileRepository,
  verifyAccount: verifyNgPosBankAccount,
}

export async function verifyBankPayoutBeneficiary(
  req: Request,
  body: Record<string, unknown>,
  dependencies: VerifiedBankNameDependencies = defaultDependencies,
) {
  return verifyPocketBankAccount(req, body, dependencies)
}

export async function assertBankAccountMatchesPocketName(
  req: Request,
  body: Record<string, unknown>,
  dependencies: VerifiedBankNameDependencies = defaultDependencies,
) {
  const { identity, profile, verification } = await verifyPocketBankAccount(req, body, dependencies)
  if (normalizeBankLegalName(verification.account_name) !== normalizeBankLegalName(profile.resolvedName)) {
    throw Object.assign(new Error('This account belongs to a different verified name. Use an account in your verified name.'), { status: 403 })
  }
  return { identity, profile, verification }
}

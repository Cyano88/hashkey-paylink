import { createHash } from 'node:crypto'
import type { Request } from 'express'
import { createArcAgreementPayerHandler } from './arc-agreement-payer.js'
import { readArcAgreementByPayerAccess } from './arc-agreements.js'
import { resolveDeveloperApiKeyPolicy } from './developer-projects.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value: unknown, maximum: number) {
  return String(value ?? '').trim().slice(0, maximum)
}

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

export function projectPayerUserId(partnerId: string, email: string) {
  const digest = createHash('sha256')
    .update(`hashpaylink.project-payer\0${partnerId}\0${email.toLowerCase()}`)
    .digest('hex')
  return `project-payer:${partnerId}:${digest}`
}

export async function verifiedProjectPayer(
  req: Request,
  dependencies: {
    resolvePolicy: typeof resolveDeveloperApiKeyPolicy
    readAgreement: typeof readArcAgreementByPayerAccess
  },
) {
  const policy = await dependencies.resolvePolicy(req)
  if (!policy || policy.environment !== 'test' || policy.checkoutMode !== 'human' || !policy.capabilities.includes('arc_agreements')) {
    fail('A valid human-checkout developer API key is required.', 401)
  }
  const agreementId = clean(req.body?.agreementId, 80)
  const capability = clean(req.headers['x-arc-agreement-access'], 160)
  const email = clean(req.body?.payerEmail, 254).toLowerCase()
  if (!agreementId || !capability || !EMAIL.test(email)) {
    fail('Agreement access and verified payer email are required.', 400)
  }
  const agreement = await dependencies.readAgreement(agreementId, capability)
  if (!agreement || agreement.partnerId !== policy.partnerId || agreement.checkoutMode !== 'human') {
    fail('Agreement payer access is invalid or expired.', 404)
  }
  if (!agreement.payerEmail || agreement.payerEmail !== email) {
    fail('This agreement is not available for this payer email.', 403)
  }
  return { userId: projectPayerUserId(policy.partnerId, email), email }
}

export function createArcAgreementProjectPayerHandler(overrides: {
  resolvePolicy?: typeof resolveDeveloperApiKeyPolicy
  readAgreement?: typeof readArcAgreementByPayerAccess
} = {}) {
  const resolvePolicy = overrides.resolvePolicy ?? resolveDeveloperApiKeyPolicy
  const readAgreement = overrides.readAgreement ?? readArcAgreementByPayerAccess

  return createArcAgreementPayerHandler({
    verifyUser: req => verifiedProjectPayer(req, { resolvePolicy, readAgreement }),
  })
}

export default createArcAgreementProjectPayerHandler()

import { createHash } from 'node:crypto'
import {
  readArcAgreementActivationBinding,
  type ArcAgreementActivationClient,
} from './arc-agreement-activation-attempts.js'
import { createArcAgreementActivationClient } from './arc-agreement-activation-client.js'
import { readConfirmedArcAgreementSnapshot } from './arc-agreement-confirmed-snapshot.js'
import {
  createArcAgreementOperatorActionRequest,
  listArcAgreementOperatorActions,
  type ArcAgreementOperatorAction,
} from './arc-agreement-operator-actions.js'
import { createArcAgreementOperatorClient } from './arc-agreement-operator-client.js'
import { prepareArcAgreementReleaseCall } from './arc-agreement-operator.js'

type ReleaseTemplate = 'fixed_unlock' | 'progressive_release' | 'milestone'

type Dependencies = {
  listOperatorActions: typeof listArcAgreementOperatorActions
  binding: typeof readArcAgreementActivationBinding
  confirmed: typeof readConfirmedArcAgreementSnapshot
  prepareRelease: typeof prepareArcAgreementReleaseCall
  createOperatorAction: typeof createArcAgreementOperatorActionRequest
  operatorClient: typeof createArcAgreementOperatorClient
  chainClient: () => ArcAgreementActivationClient
}

const defaults: Dependencies = {
  listOperatorActions: listArcAgreementOperatorActions,
  binding: readArcAgreementActivationBinding,
  confirmed: readConfirmedArcAgreementSnapshot,
  prepareRelease: prepareArcAgreementReleaseCall,
  createOperatorAction: createArcAgreementOperatorActionRequest,
  operatorClient: createArcAgreementOperatorClient,
  chainClient: createArcAgreementActivationClient,
}

function inputError(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function evidenceUrl(value: unknown) {
  const candidate = clean(value, 240)
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw inputError('Add a complete HTTPS delivery link.')
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw inputError('Delivery proof must use a secure HTTPS link.')
  }
  return parsed.toString()
}

function requestIdempotencyKey(seed: string) {
  const bytes = Buffer.from(createHash('sha256').update(seed).digest())
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function publicArcAgreementReleaseRequest(action?: ArcAgreementOperatorAction) {
  if (!action || action.action !== 'release') return null
  return {
    id: action.id,
    step: action.step ?? 0,
    status: action.status,
    deliveryNote: action.deliveryNote ?? '',
    evidenceReference: action.evidenceReference,
    requestedAt: action.requestedAt,
    reviewedAt: action.reviewedAt,
    reviewNote: action.reviewNote,
    completedAt: action.completedAt,
    transactionHash: action.transactionHash,
    updatedAt: action.updatedAt,
  }
}

export async function requestArcAgreementRelease(input: {
  partnerId: string
  agreementId: string
  template: ReleaseTemplate
  requestedBy: string
  deliveryNote: unknown
  evidenceReference: unknown
}, overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  const partnerId = clean(input.partnerId, 80)
  const agreementId = clean(input.agreementId, 80)
  const requestedBy = clean(input.requestedBy, 160)
  const deliveryNote = clean(input.deliveryNote, 500)
  const evidenceReference = evidenceUrl(input.evidenceReference)
  if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId) || !/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
    throw inputError('Agreement identity is invalid.')
  }
  if (!['fixed_unlock', 'progressive_release', 'milestone'].includes(input.template)) {
    throw inputError('Agreement release template is invalid.')
  }
  if (deliveryNote.length < 12) throw inputError('Briefly describe what was delivered.')
  if (!/^[a-zA-Z0-9@._:+-]{3,160}$/.test(requestedBy)) throw inputError('Release requester is invalid.')

  let binding: Awaited<ReturnType<typeof readArcAgreementActivationBinding>>
  try {
    binding = await dependencies.binding(partnerId, agreementId)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    if (message.includes('was not found for this project') || message.includes('require a durably active escrow')) {
      throw inputError('The agreement must be active before delivery can be submitted.', 409)
    }
    throw reason
  }
  const confirmed = await dependencies.confirmed(dependencies.chainClient(), binding.escrow)
  const step = input.template === 'fixed_unlock' ? 0 : confirmed.snapshot.nextStep
  const releaseSteps = binding.prepared.cumulativeReleaseBps.length
  if (confirmed.snapshot.status !== 1 || step !== confirmed.snapshot.nextStep || step >= releaseSteps) {
    throw inputError('This agreement has no release ready for review.', 409)
  }
  const priorActions = (await dependencies.listOperatorActions({ partnerId, agreementId, limit: 250 }))
    .filter(item => item.action === 'release' && item.step === step)
  const existing = priorActions[0]
  if (existing && existing.status !== 'disputed') {
    return { replayed: true, action: existing }
  }

  const operatorWallet = await dependencies.operatorClient().operatorWallet(confirmed.snapshot.operator)
  const evidenceHash = `0x${createHash('sha256').update(JSON.stringify({
    domain: 'hashpaylink.arc-agreement-release.evidence',
    partnerId,
    agreementId,
    template: input.template,
    step,
    evidenceReference,
    deliveryNote,
    reviewPolicy: 'payer',
    requestedBy,
  })).digest('hex')}`
  const idempotencyKey = requestIdempotencyKey([
    'hashpaylink.agreement-release.request',
    partnerId,
    agreementId,
    String(step),
    requestedBy,
    existing?.id ?? 'initial',
  ].join('\0'))
  const preparedCall = dependencies.prepareRelease({
    operatorWallet,
    idempotencyKey,
    partnerId,
    agreementId,
    prepared: binding.prepared,
    confirmed,
    step,
    evidenceHash,
  })
  const action = await dependencies.createOperatorAction({
    partnerId,
    agreementId,
    action: 'release',
    step,
    evidenceHash,
    evidenceReference,
    deliveryNote,
    reviewPolicy: 'payer',
    requestedBy,
    idempotencyKey,
    preparedCall,
  })
  return { replayed: false, action }
}

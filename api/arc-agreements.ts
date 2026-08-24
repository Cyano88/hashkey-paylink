import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAddress, isAddress, parseUnits } from 'viem'
import {
  arcAgreementClientReference,
  arcAgreementCumulativeReleaseBps,
  arcAgreementTerms,
  assertArcAgreementReleasePayouts,
} from './arc-agreement-terms.js'
import {
  listArcAgreementActivationAttemptRecords,
  readArcAgreementActivationAttemptRecord,
} from './arc-agreement-activation-attempts.js'
import {
  publicArcAgreementReleaseRequest,
  requestArcAgreementRelease,
} from './arc-agreement-creator-actions.js'
import { listArcAgreementOperatorActions } from './arc-agreement-operator-actions.js'
import { listArcAgreementPayerLifecycleActions } from './arc-agreement-payer-lifecycle.js'
import { createArcAgreementDeveloperView } from './arc-agreement-developer-view.js'
import { resolveDeveloperApiKeyPolicy, type DeveloperCheckoutMode, type DeveloperCheckoutPolicy } from './developer-projects.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './render-durable-store.js'

const STORE_KEY = process.env.ARC_AGREEMENT_STORE_KEY?.trim() || 'hashpaylink:arc-agreements:v1'
const TEMPLATES = ['fixed_unlock', 'progressive_release', 'milestone'] as const
type AgreementTemplate = typeof TEMPLATES[number]

type PercentageStep = {
  label?: string
  percentage: number
}

export type ArcAgreement = {
  id: string
  partnerId: string
  checkoutMode: DeveloperCheckoutMode
  environment: 'test'
  network: 'arc'
  template: AgreementTemplate
  externalId: string
  resourceId: string
  title: string
  description: string
  amount: string
  recipient: string
  durationSeconds: number
  cancellationWindowSeconds: number
  payerEmail?: string
  checkpoints?: PercentageStep[]
  milestones?: Array<{ label: string; percentage: number }>
  termsHash: `0x${string}`
  clientReference: `0x${string}`
  chainTerms: ReturnType<typeof arcAgreementTerms>
  status: 'draft'
  activationStatus: 'private_pilot'
  requestHash: string
  payerAccessHash: string
  createdAt: string
  updatedAt: string
}

type AgreementStore = {
  agreements: Record<string, ArcAgreement>
  idempotency: Record<string, string>
}

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<AgreementStore | undefined>
  mutate: (key: string, update: (current: AgreementStore | undefined) => AgreementStore) => Promise<AgreementStore>
  policy: (req: Pick<Request, 'headers'>) => Promise<DeveloperCheckoutPolicy | null>
  hasActivationAttempt: (partnerId: string, agreementId: string) => Promise<boolean>
  requestRelease: typeof requestArcAgreementRelease
  listOperatorActions: typeof listArcAgreementOperatorActions
  listActivationAttempts: typeof listArcAgreementActivationAttemptRecords
  listPayerLifecycleActions: typeof listArcAgreementPayerLifecycleActions
  createId: () => string
  createPayerAccessToken: () => string
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: mutateDurableJson,
  policy: resolveDeveloperApiKeyPolicy,
  hasActivationAttempt: async (partnerId, agreementId) => {
    try {
      await readArcAgreementActivationAttemptRecord(partnerId, agreementId)
      return true
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes('was not found for this project')) return false
      throw reason
    }
  },
  requestRelease: requestArcAgreementRelease,
  listOperatorActions: listArcAgreementOperatorActions,
  listActivationAttempts: listArcAgreementActivationAttemptRecords,
  listPayerLifecycleActions: listArcAgreementPayerLifecycleActions,
  createId: () => `agr_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
  createPayerAccessToken: () => `agrp_${randomBytes(32).toString('base64url')}`,
  now: () => new Date(),
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizedAmount(value: unknown) {
  const amount = clean(value, 40)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount)) {
    throw Object.assign(new Error('Amount must be a positive USDC value with no more than 6 decimal places.'), { status: 400 })
  }
  const [whole, fraction = ''] = amount.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n || units > 1_000_000_000_000n) {
    throw Object.assign(new Error('Amount must be greater than 0 and no more than 1,000,000 USDC.'), { status: 400 })
  }
  const normalizedFraction = fraction.replace(/0+$/, '')
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole
}

function percentage(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw Object.assign(new Error(`${label} must be a whole percentage from 1 to 100.`), { status: 400 })
  }
  return parsed
}

function normalizedTemplate(value: unknown): AgreementTemplate {
  const template = clean(value, 40).toLowerCase()
  if (!TEMPLATES.includes(template as AgreementTemplate)) {
    throw Object.assign(new Error('Template must be fixed_unlock, progressive_release, or milestone.'), { status: 400 })
  }
  return template as AgreementTemplate
}

function normalizedCheckpoints(value: unknown) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) {
    throw Object.assign(new Error('Progressive release requires 2 to 20 checkpoints.'), { status: 400 })
  }
  let previous = 0
  const checkpoints = value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const current = percentage(record.percentage, `Checkpoint ${index + 1}`)
    if (current <= previous) {
      throw Object.assign(new Error('Checkpoint percentages must increase.'), { status: 400 })
    }
    previous = current
    const label = clean(record.label, 80)
    return { ...(label ? { label } : {}), percentage: current }
  })
  if (checkpoints[checkpoints.length - 1]?.percentage !== 100) {
    throw Object.assign(new Error('The final checkpoint must be 100 percent.'), { status: 400 })
  }
  return checkpoints
}

function normalizedMilestones(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw Object.assign(new Error('Milestone agreements require 1 to 10 milestones.'), { status: 400 })
  }
  const milestones = value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const label = clean(record.label, 80)
    if (label.length < 2) throw Object.assign(new Error(`Milestone ${index + 1} needs a label.`), { status: 400 })
    return { label, percentage: percentage(record.percentage, `Milestone ${index + 1}`) }
  })
  if (milestones.reduce((total, item) => total + item.percentage, 0) !== 100) {
    throw Object.assign(new Error('Milestone percentages must total 100.'), { status: 400 })
  }
  return milestones
}

function wholeSeconds(value: unknown, fallback: number, label: string, minimum: number, maximum: number) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw Object.assign(new Error(`${label} must be a whole number from ${minimum} to ${maximum} seconds.`), { status: 400 })
  }
  return parsed
}

function normalizedEmail(value: unknown) {
  const email = clean(value, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('payerEmail must be a valid customer email address.'), { status: 400 })
  }
  return email
}

function maskedEmail(value: string) {
  const [local = '', domain = ''] = value.split('@')
  return `${local.slice(0, 2)}${local.length > 2 ? '***' : '*'}@${domain}`
}

function requestInput(body: unknown, checkoutMode: DeveloperCheckoutMode) {
  const source = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const template = normalizedTemplate(source.template)
  const title = clean(source.title, 140)
  const description = clean(source.description, 800)
  const externalId = clean(source.externalId, 120)
  const resourceId = clean(source.resourceId, 160)
  const rawRecipient = clean(source.recipient, 100)
  if (title.length < 3) throw Object.assign(new Error('Add a clear agreement title.'), { status: 400 })
  if (description.length < 10) throw Object.assign(new Error('Add a short agreement description.'), { status: 400 })
  if (!externalId) throw Object.assign(new Error('externalId is required.'), { status: 400 })
  if (!resourceId) throw Object.assign(new Error('resourceId is required.'), { status: 400 })
  if (!isAddress(rawRecipient) || /^0x0{40}$/i.test(rawRecipient)) {
    throw Object.assign(new Error('Recipient must be a valid non-zero Arc address.'), { status: 400 })
  }
  const durationSeconds = wholeSeconds(source.durationSeconds, 86_400, 'durationSeconds', 3_600, 31_622_400)
  const cancellationWindowSeconds = wholeSeconds(source.cancellationWindowSeconds, 900, 'cancellationWindowSeconds', 0, 2_592_000)
  if (cancellationWindowSeconds >= durationSeconds) {
    throw Object.assign(new Error('cancellationWindowSeconds must be shorter than durationSeconds.'), { status: 400 })
  }

  const base = {
    template,
    externalId,
    resourceId,
    title,
    description,
    amount: normalizedAmount(source.amount),
    recipient: getAddress(rawRecipient),
    durationSeconds,
    cancellationWindowSeconds,
    ...(checkoutMode === 'human' ? { payerEmail: normalizedEmail(source.payerEmail) } : {}),
  }
  if (template === 'progressive_release') {
    if (source.milestones !== undefined) throw Object.assign(new Error('Progressive release does not accept milestones.'), { status: 400 })
    const input = { ...base, checkpoints: normalizedCheckpoints(source.checkpoints) }
    try {
      assertArcAgreementReleasePayouts(parseUnits(input.amount, 6), arcAgreementCumulativeReleaseBps(input))
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { status: 400 })
    }
    return input
  }
  if (template === 'milestone') {
    if (source.checkpoints !== undefined) throw Object.assign(new Error('Milestone agreements do not accept checkpoints.'), { status: 400 })
    const input = { ...base, milestones: normalizedMilestones(source.milestones) }
    try {
      assertArcAgreementReleasePayouts(parseUnits(input.amount, 6), arcAgreementCumulativeReleaseBps(input))
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { status: 400 })
    }
    return input
  }
  if (source.checkpoints !== undefined || source.milestones !== undefined) {
    throw Object.assign(new Error('Fixed unlock agreements do not accept a release schedule.'), { status: 400 })
  }
  return base
}

function hashRequest(value: object) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function idempotencyScope(partnerId: string, idempotencyKey: string) {
  return createHash('sha256').update(`${partnerId}\0${idempotencyKey}`).digest('hex')
}

function publicAgreement(agreement: ArcAgreement) {
  const { requestHash: _requestHash, payerAccessHash: _payerAccessHash, payerEmail, ...publicRecord } = agreement
  return {
    ...publicRecord,
    ...(payerEmail ? { payerEmailMasked: maskedEmail(payerEmail) } : {}),
  }
}

function payerAccessHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function safeHashEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export async function readArcAgreementByPayerAccess(
  agreementIdValue: string,
  accessTokenValue: string,
  read: Dependencies['read'] = defaults.read,
) {
  const agreementId = clean(agreementIdValue, 80)
  const accessToken = clean(accessTokenValue, 160)
  if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId) || !/^agrp_[A-Za-z0-9_-]{40,100}$/.test(accessToken)) {
    return null
  }
  const agreement = (await read(STORE_KEY))?.agreements?.[agreementId]
  if (!agreement?.payerAccessHash || !safeHashEqual(agreement.payerAccessHash, payerAccessHash(accessToken))) {
    return null
  }
  return agreement
}

export async function listArcAgreementRecords(
  input: { partnerId?: string; limit?: number } = {},
  read: Dependencies['read'] = defaults.read,
) {
  const partnerId = clean(input.partnerId, 80)
  if (partnerId && !/^dev_[a-z0-9]{8,64}$/i.test(partnerId)) {
    throw new Error('Developer project id is invalid.')
  }
  const limit = Math.min(250, Math.max(1, Math.trunc(input.limit ?? 100)))
  const store = await read(STORE_KEY)
  return Object.values(store?.agreements ?? {})
    .filter(agreement => !partnerId || agreement.partnerId === partnerId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
}

export async function readArcAgreementForProject(
  partnerIdValue: string,
  agreementIdValue: string,
  read: Dependencies['read'] = defaults.read,
) {
  const partnerId = clean(partnerIdValue, 80)
  const agreementId = clean(agreementIdValue, 80)
  if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId) || !/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
    throw Object.assign(new Error('Agreement identity is invalid.'), { status: 400 })
  }
  const agreement = (await read(STORE_KEY))?.agreements?.[agreementId]
  return agreement?.partnerId === partnerId ? agreement : null
}

export async function rotateArcAgreementPayerAccess(
  partnerIdValue: string,
  agreementIdValue: string,
  overrides: Partial<Pick<Dependencies, 'hasStore' | 'mutate' | 'createPayerAccessToken' | 'now'>> = {},
) {
  const dependencies = { ...defaults, ...overrides }
  if (!dependencies.hasStore()) throw Object.assign(new Error('Agreement storage is not configured.'), { status: 503 })
  const partnerId = clean(partnerIdValue, 80)
  const agreementId = clean(agreementIdValue, 80)
  if (!/^dev_[a-z0-9]{8,64}$/i.test(partnerId) || !/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
    throw Object.assign(new Error('Agreement identity is invalid.'), { status: 400 })
  }
  const payerAccessToken = dependencies.createPayerAccessToken()
  if (!/^agrp_[A-Za-z0-9_-]{40,100}$/.test(payerAccessToken)) {
    throw new Error('Agreement payer-access token generator is invalid.')
  }
  let agreement: ArcAgreement | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const existing = current?.agreements?.[agreementId]
    if (!existing || existing.partnerId !== partnerId) {
      throw Object.assign(new Error('Agreement not found.'), { status: 404 })
    }
    agreement = {
      ...existing,
      payerAccessHash: payerAccessHash(payerAccessToken),
      updatedAt: dependencies.now().toISOString(),
    }
    return {
      agreements: { ...(current?.agreements ?? {}), [agreementId]: agreement },
      idempotency: { ...(current?.idempotency ?? {}) },
    }
  })
  if (!agreement) throw new Error('Agreement payer access could not be rotated.')
  return {
    agreement: publicAgreement(agreement),
    payerAccessToken,
    payerReviewPath: `/agreements/${agreement.id}#access=${encodeURIComponent(payerAccessToken)}`,
  }
}

function requirePreviewPolicy(policy: DeveloperCheckoutPolicy | null) {
  if (!policy) throw Object.assign(new Error('A valid developer API key is required.'), { status: 401 })
  if (!policy.capabilities.includes('arc_agreements')) {
    throw Object.assign(new Error('This project has not enabled Arc Agreements.'), { status: 403 })
  }
  if (policy.environment !== 'test') {
    throw Object.assign(new Error('Arc Agreements is currently available with test keys only.'), { status: 403 })
  }
  if (policy.settlementMode !== 'usdc' || !policy.paymentOptions.some(option => option.network === 'arc')) {
    throw Object.assign(new Error('Arc Agreements requires an Arc Testnet USDC project route.'), { status: 409 })
  }
  return policy
}

function noStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store')
}

export function createArcAgreementsHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { ...defaults, ...overrides }
  return async function arcAgreementsHandler(req: Request, res: Response) {
    noStore(res)
    try {
      if (!dependencies.hasStore()) throw Object.assign(new Error('Agreement storage is not configured.'), { status: 503 })
      if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
      const policy = requirePreviewPolicy(await dependencies.policy(req))

      if (req.method === 'GET') {
        const id = clean(req.query?.id, 80)
        if (!id) {
          const requestedIds = [...new Set(clean(req.query?.ids, 8_100)
            .split(',')
            .map(value => value.trim())
            .filter(Boolean))]
          if (requestedIds.length > 100 || requestedIds.some(value => !/^agr_[a-z0-9]{12,64}$/i.test(value))) {
            return res.status(400).json({ ok: false, error: 'ids must contain no more than 100 valid agreement ids.' })
          }
          const requestedLimit = Number(req.query?.limit ?? 100)
          const limit = Number.isFinite(requestedLimit)
            ? Math.min(250, Math.max(1, Math.trunc(requestedLimit)))
            : 100
          const recordsPromise = requestedIds.length
            ? dependencies.read(STORE_KEY).then(store => requestedIds.flatMap(requestedId => {
                const agreement = store?.agreements?.[requestedId]
                return agreement?.partnerId === policy.partnerId ? [agreement] : []
              }))
            : listArcAgreementRecords({ partnerId: policy.partnerId, limit }, dependencies.read)
          const [records, actions, attempts, payerActions] = await Promise.all([
            recordsPromise,
            dependencies.listOperatorActions({ partnerId: policy.partnerId, limit: 250 }),
            dependencies.listActivationAttempts({ partnerId: policy.partnerId, limit: 250 }),
            dependencies.listPayerLifecycleActions({ partnerId: policy.partnerId, limit: 250 }),
          ])
          const attemptsByAgreement = new Map(attempts.map(attempt => [attempt.agreementId, attempt]))
          const agreements = records.map(agreement => ({
            ...publicAgreement(agreement),
            ...createArcAgreementDeveloperView({
              draft: agreement,
              attempt: attemptsByAgreement.get(agreement.id),
              operatorActions: actions.filter(action => action.agreementId === agreement.id),
              payerActions: payerActions.filter(action => action.agreementId === agreement.id),
            }),
          }))
          return res.json({ ok: true, agreements })
        }
        if (!/^agr_[a-z0-9]{12,64}$/i.test(id)) return res.status(400).json({ ok: false, error: 'A valid agreement id is required.' })
        const agreement = (await dependencies.read(STORE_KEY))?.agreements?.[id]
        if (!agreement || agreement.partnerId !== policy.partnerId) return res.status(404).json({ ok: false, error: 'Agreement not found.' })
        const [actions, attempts, payerActions] = await Promise.all([
          dependencies.listOperatorActions({ partnerId: policy.partnerId, agreementId: agreement.id, limit: 250 }),
          dependencies.listActivationAttempts({ partnerId: policy.partnerId, limit: 250 }),
          dependencies.listPayerLifecycleActions({ partnerId: policy.partnerId, limit: 250 }),
        ])
        const view = createArcAgreementDeveloperView({
          draft: agreement,
          attempt: attempts.find(attempt => attempt.agreementId === agreement.id),
          operatorActions: actions,
          payerActions: payerActions.filter(action => action.agreementId === agreement.id),
        })
        return res.json({
          ok: true,
          agreement: { ...publicAgreement(agreement), ...view },
          releaseRequest: view.releaseRequest,
          receipt: view.receipt,
        })
      }

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {}
      if (body.action === 'rotate_payer_link') {
        if (policy.checkoutMode !== 'human') {
          return res.status(409).json({
            ok: false,
            error: 'Agentic agreements do not use human payer links. Use the dedicated agent activation API.',
          })
        }
        const agreementId = clean(body.agreementId, 80)
        if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
          return res.status(400).json({ ok: false, error: 'A valid agreement id is required.' })
        }
        if (await dependencies.hasActivationAttempt(policy.partnerId, agreementId)) {
          return res.status(409).json({
            ok: false,
            error: 'Payer access cannot be changed after agreement activation has started.',
          })
        }
        const rotated = await rotateArcAgreementPayerAccess(policy.partnerId, agreementId, {
          hasStore: dependencies.hasStore,
          mutate: dependencies.mutate,
          createPayerAccessToken: dependencies.createPayerAccessToken,
          now: dependencies.now,
        })
        return res.json({
          ok: true,
          agreement: rotated.agreement,
          payerAccessToken: rotated.payerAccessToken,
          payerReviewPath: rotated.payerReviewPath,
        })
      }
      if (body.action === 'request_release') {
        const agreementId = clean(body.agreementId, 80)
        if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
          return res.status(400).json({ ok: false, error: 'A valid agreement id is required.' })
        }
        const agreement = (await dependencies.read(STORE_KEY))?.agreements?.[agreementId]
        if (!agreement || agreement.partnerId !== policy.partnerId) {
          return res.status(404).json({ ok: false, error: 'Agreement not found.' })
        }
        const result = await dependencies.requestRelease({
          partnerId: policy.partnerId,
          agreementId,
          template: agreement.template,
          requestedBy: `developer-api:${policy.partnerId}`,
          deliveryNote: body.deliveryNote,
          evidenceReference: body.evidenceReference,
        })
        return res.status(result.replayed ? 200 : 201).json({
          ok: true,
          replayed: result.replayed,
          releaseRequest: publicArcAgreementReleaseRequest(result.action),
        })
      }

      const idempotencyKey = clean(req.headers['idempotency-key'], 160)
      if (idempotencyKey.length < 8) {
        return res.status(400).json({ ok: false, error: 'Idempotency-Key must contain at least 8 characters.' })
      }
      const input = requestInput(req.body, policy.checkoutMode)
      const configuredArcRecipient = policy.paymentOptions.find(option => option.network === 'arc')?.recipient ?? ''
      if (!isAddress(configuredArcRecipient) || getAddress(input.recipient) !== getAddress(configuredArcRecipient)) {
        throw Object.assign(
          new Error("Recipient must match this project's configured Arc Testnet receiving address."),
          { status: 409 },
        )
      }
      const requestHash = hashRequest(input)
      const scopedIdempotencyKey = idempotencyScope(policy.partnerId, idempotencyKey)
      const now = dependencies.now().toISOString()
      let agreement: ArcAgreement | undefined
      let replayed = false
      let payerAccessToken = ''

      await dependencies.mutate(STORE_KEY, current => {
        const store: AgreementStore = {
          agreements: { ...(current?.agreements ?? {}) },
          idempotency: { ...(current?.idempotency ?? {}) },
        }
        const existingId = store.idempotency[scopedIdempotencyKey]
        if (existingId) {
          const existing = store.agreements[existingId]
          if (!existing) throw Object.assign(new Error('The idempotent agreement record is unavailable.'), { status: 409 })
          if (existing.requestHash !== requestHash) {
            throw Object.assign(new Error('Idempotency-Key was already used for a different agreement request.'), { status: 409 })
          }
          agreement = existing
          replayed = true
          return store
        }

        const id = dependencies.createId()
        if (policy.checkoutMode === 'human') {
          payerAccessToken = dependencies.createPayerAccessToken()
          if (!/^agrp_[A-Za-z0-9_-]{40,100}$/.test(payerAccessToken)) {
            throw new Error('Agreement payer-access token generator is invalid.')
          }
        }
        const chainTerms = arcAgreementTerms(input)
        agreement = {
          id,
          partnerId: policy.partnerId,
          checkoutMode: policy.checkoutMode,
          environment: 'test',
          network: 'arc',
          ...input,
          termsHash: chainTerms.termsHash,
          clientReference: arcAgreementClientReference(policy.partnerId, id),
          chainTerms,
          status: 'draft',
          activationStatus: 'private_pilot',
          requestHash,
          payerAccessHash: payerAccessToken ? payerAccessHash(payerAccessToken) : '',
          createdAt: now,
          updatedAt: now,
        }
        store.agreements[id] = agreement
        store.idempotency[scopedIdempotencyKey] = id
        return store
      })

      if (!agreement) throw new Error('Agreement draft could not be stored.')
      return res.status(replayed ? 200 : 201).json({
        ok: true,
        replayed,
        agreement: publicAgreement(agreement),
        ...(!replayed && payerAccessToken ? {
          payerAccessToken,
          payerReviewPath: `/agreements/${agreement.id}#access=${encodeURIComponent(payerAccessToken)}`,
        } : {}),
        nextAction: policy.checkoutMode === 'human'
          ? 'Send payerReviewPath to the payer. Funding remains restricted to projects authorized for the private Arc Testnet pilot.'
          : 'Prepare the agent payer calls through /api/v2/agreements/agent. Funding remains restricted to approved Arc Testnet pilot projects.',
      })
    } catch (error) {
      const status = Number((error as Error & { status?: number })?.status) || 500
      if (status >= 500) console.error('[arc-agreements] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(status).json({ ok: false, error: status >= 500 ? 'Arc Agreements is temporarily unavailable.' : (error as Error).message })
    }
  }
}

export default createArcAgreementsHandler()

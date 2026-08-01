import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import {
  createArcAgreementsHandler,
  listArcAgreementRecords,
  rotateArcAgreementPayerAccess,
  type ArcAgreement,
} from './arc-agreements.js'
import {
  readArcAgreementActivationAttemptRecord,
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
import {
  resolveDeveloperProjectPolicy,
  verifyDeveloperProjectOwner,
  type DeveloperCheckoutPolicy,
} from './developer-projects.js'
import { hasRenderDurableStore, readDurableJson } from './render-durable-store.js'

const DEFAULT_EVENT_STORE_KEY = 'hashpaylink:hashpaystream-arc-webhooks:v1'
const PROJECT_ID = /^dev_[a-z0-9]{8,64}$/i

type StoredEvent = {
  id: string
  event: string
  projectId: string
  agreementId: string
  createdAt: string
  receivedAt: string
  data: Record<string, unknown>
}

type EventStore = {
  schema: 1
  events: Record<string, StoredEvent>
}

type Dependencies = {
  hasStore: () => boolean
  authorize: (req: Request, projectId: string) => Promise<{ id: string; ownerId: string; name: string; capabilities: string[] }>
  readEvents: (key: string) => Promise<EventStore | undefined>
  listAgreements: (input: { partnerId: string; limit: number }) => Promise<ArcAgreement[]>
  projectPolicy: (projectId: string) => Promise<DeveloperCheckoutPolicy | null>
  createAgreement: (req: Request, res: Response, policy: DeveloperCheckoutPolicy) => Promise<unknown>
  hasActivationAttempt: (partnerId: string, agreementId: string) => Promise<boolean>
  rotatePayerAccess: (partnerId: string, agreementId: string) => ReturnType<typeof rotateArcAgreementPayerAccess>
  listOperatorActions: typeof listArcAgreementOperatorActions
  binding: typeof readArcAgreementActivationBinding
  confirmed: typeof readConfirmedArcAgreementSnapshot
  prepareRelease: typeof prepareArcAgreementReleaseCall
  createOperatorAction: typeof createArcAgreementOperatorActionRequest
  operatorClient: typeof createArcAgreementOperatorClient
  chainClient: () => ArcAgreementActivationClient
  env: () => NodeJS.ProcessEnv
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  authorize: verifyDeveloperProjectOwner,
  readEvents: readDurableJson,
  listAgreements: input => listArcAgreementRecords(input),
  projectPolicy: projectId => resolveDeveloperProjectPolicy(projectId, 'test'),
  createAgreement: (req, res, policy) => createArcAgreementsHandler({ policy: async () => policy })(req, res),
  hasActivationAttempt: async (partnerId, agreementId) => {
    try {
      await readArcAgreementActivationAttemptRecord(partnerId, agreementId)
      return true
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes('was not found for this project')) return false
      throw reason
    }
  },
  rotatePayerAccess: rotateArcAgreementPayerAccess,
  listOperatorActions: listArcAgreementOperatorActions,
  binding: readArcAgreementActivationBinding,
  confirmed: readConfirmedArcAgreementSnapshot,
  prepareRelease: prepareArcAgreementReleaseCall,
  createOperatorAction: createArcAgreementOperatorActionRequest,
  operatorClient: createArcAgreementOperatorClient,
  chainClient: createArcAgreementActivationClient,
  env: () => process.env,
}

const EVENT_STATUS: Record<string, string> = {
  'agreement.activated': 'active',
  'agreement.step_released': 'active',
  'agreement.expired': 'expired',
  'agreement.completed': 'completed',
  'agreement.cancelled': 'cancelled',
  'agreement.refunded': 'refunded',
}

function safeDate(value: unknown) {
  const text = String(value ?? '').trim()
  return Number.isFinite(Date.parse(text)) ? text : ''
}

function safeUnits(value: unknown) {
  const text = String(value ?? '').trim()
  return /^\d{1,40}$/.test(text) ? text : '0'
}

function safeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : 0
}

function safeAddress(value: unknown) {
  const text = String(value ?? '').trim()
  return /^0x[a-f0-9]{40}$/i.test(text) ? text : ''
}

function safeHash(value: unknown) {
  const text = String(value ?? '').trim()
  return /^0x[a-f0-9]{64}$/i.test(text) ? text : ''
}

function createRequestIdempotencyKey(seed: string) {
  const bytes = Buffer.from(createHash('sha256').update(seed).digest())
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function publicReleaseRequest(action?: ArcAgreementOperatorAction) {
  if (!action || action.action !== 'release') return null
  return {
    id: action.id,
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

function deliveryEvidenceUrl(value: unknown) {
  const candidate = String(value ?? '').trim().slice(0, 240)
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw Object.assign(new Error('Add a complete HTTPS delivery link.'), { status: 400 })
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw Object.assign(new Error('Delivery proof must use a secure HTTPS link.'), { status: 400 })
  }
  return parsed.toString()
}

function blockNumber(event: StoredEvent) {
  const value = safeUnits(event.data?.observedBlockNumber)
  try { return BigInt(value) } catch { return 0n }
}

function compareEvents(left: StoredEvent, right: StoredEvent) {
  const blockDifference = blockNumber(left) - blockNumber(right)
  if (blockDifference !== 0n) return blockDifference > 0n ? 1 : -1
  return (safeDate(left.createdAt) || safeDate(left.receivedAt)).localeCompare(
    safeDate(right.createdAt) || safeDate(right.receivedAt),
  )
}

function publicDraft(agreement?: ArcAgreement) {
  if (!agreement) return null
  return {
    title: agreement.title,
    description: agreement.description,
    template: agreement.template,
    amount: agreement.amount,
    recipient: agreement.recipient,
    durationSeconds: agreement.durationSeconds,
    cancellationWindowSeconds: agreement.cancellationWindowSeconds,
    checkpoints: agreement.checkpoints ?? [],
    milestones: agreement.milestones ?? [],
    createdAt: agreement.createdAt,
  }
}

function agreementRecord(agreementId: string, draft: ArcAgreement | undefined, events: StoredEvent[]) {
  const ordered = [...events].sort(compareEvents)
  const latest = ordered.at(-1)
  const data = latest?.data ?? {}
  const statusFromPayload = String(data.status ?? '').trim().toLowerCase()
  const status = latest?.event === 'agreement.step_released' && statusFromPayload === 'completed'
    ? 'completed'
    : EVENT_STATUS[latest?.event ?? ''] ?? 'awaiting_start'
  const terminal = ['completed', 'cancelled', 'refunded'].includes(status)
  return {
    id: agreementId,
    ...publicDraft(draft),
    status,
    chain: latest ? {
      network: 'arc',
      chainId: 5_042_002,
      escrow: safeAddress(data.escrow),
      onchainAgreementId: safeHash(data.onchainAgreementId),
      termsHash: safeHash(data.termsHash),
      amountUsdcUnits: safeUnits(data.amountUsdcUnits),
      releasedUsdcUnits: safeUnits(data.releasedAmountUsdcUnits),
      remainingUsdcUnits: terminal ? '0' : safeUnits(data.unreleasedAmountUsdcUnits),
      nextStep: safeInteger(data.nextStep, 10_000),
      releaseSteps: safeInteger(data.releaseSteps, 10_000),
      observedBlockNumber: safeUnits(data.observedBlockNumber),
      observedBlockTimestamp: safeUnits(data.observedBlockTimestamp),
    } : null,
    timeline: ordered.map(event => ({
      id: event.id,
      event: event.event,
      createdAt: safeDate(event.createdAt),
      receivedAt: safeDate(event.receivedAt),
      observedBlockNumber: safeUnits(event.data?.observedBlockNumber),
    })),
    updatedAt: latest
      ? safeDate(latest.createdAt) || safeDate(latest.receivedAt)
      : draft?.updatedAt ?? '',
  }
}

export function createHashPayStreamArcAgreementsHandler(dependencies: Dependencies = defaults) {
  return async function hashPayStreamArcAgreementsHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      if (!dependencies.hasStore()) throw Object.assign(new Error('Agreement storage is unavailable.'), { status: 503 })
      const projectId = String(dependencies.env().HASHPAYSTREAM_ARC_PROJECT_ID ?? '').trim()
      const storeKey = String(dependencies.env().HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY ?? DEFAULT_EVENT_STORE_KEY).trim()
      if (!PROJECT_ID.test(projectId) || !storeKey || storeKey.length > 160) {
        throw Object.assign(new Error('Hash PayStream Agreements is not configured.'), { status: 503 })
      }
      const project = await dependencies.authorize(req, projectId)
      if (!project.capabilities.includes('arc_agreements')) {
        throw Object.assign(new Error('This project has not enabled Arc Agreements.'), { status: 403 })
      }
      if (req.method === 'POST') {
        const policy = await dependencies.projectPolicy(projectId)
        if (!policy || policy.partnerId !== projectId) {
          throw Object.assign(new Error('Create an active Arc sandbox key for this project first.'), { status: 409 })
        }
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? req.body as Record<string, unknown>
          : {}
        const action = String(body.action ?? '').trim()
        if (action === 'request_release') {
          const agreementId = String(body.agreementId ?? '').trim()
          const deliveryNote = String(body.deliveryNote ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
          const evidenceReference = deliveryEvidenceUrl(body.evidenceReference)
          if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
            throw Object.assign(new Error('A valid agreement id is required.'), { status: 400 })
          }
          if (deliveryNote.length < 12) {
            throw Object.assign(new Error('Briefly describe what was delivered.'), { status: 400 })
          }
          const agreement = (await dependencies.listAgreements({ partnerId: projectId, limit: 250 }))
            .find(item => item.id === agreementId)
          if (!agreement || agreement.template !== 'fixed_unlock') {
            throw Object.assign(new Error('Only an owned fixed agreement can request this release.'), { status: 404 })
          }
          const priorActions = (await dependencies.listOperatorActions({ partnerId: projectId, limit: 250 }))
            .filter(item => item.agreementId === agreementId && item.action === 'release')
          const existing = priorActions[0]
          if (existing && existing.status !== 'disputed') {
            return res.json({ ok: true, replayed: true, releaseRequest: publicReleaseRequest(existing) })
          }
          const binding = await dependencies.binding(projectId, agreementId)
          const confirmed = await dependencies.confirmed(dependencies.chainClient(), binding.escrow)
          if (confirmed.snapshot.status !== 1 || confirmed.snapshot.nextStep !== 0) {
            throw Object.assign(new Error('This agreement is not eligible for its fixed release.'), { status: 409 })
          }
          const operatorWallet = await dependencies.operatorClient().operatorWallet(confirmed.snapshot.operator)
          const evidenceHash = `0x${createHash('sha256').update(JSON.stringify({
            domain: 'hashpaystream.fixed-release.evidence',
            projectId,
            agreementId,
            evidenceReference,
            deliveryNote,
            reviewPolicy: 'payer',
            requestedBy: project.ownerId,
          })).digest('hex')}`
          const requestKey = createRequestIdempotencyKey([
            'hashpaystream.fixed-release.request',
            projectId,
            agreementId,
            project.ownerId,
            existing?.id ?? 'initial',
          ].join('\0'))
          const preparedCall = dependencies.prepareRelease({
            operatorWallet,
            idempotencyKey: requestKey,
            partnerId: projectId,
            agreementId,
            prepared: binding.prepared,
            confirmed,
            step: 0,
            evidenceHash,
          })
          const created = await dependencies.createOperatorAction({
            partnerId: projectId,
            agreementId,
            action: 'release',
            step: 0,
            evidenceHash,
            evidenceReference,
            deliveryNote,
            reviewPolicy: 'payer',
            requestedBy: project.ownerId,
            idempotencyKey: requestKey,
            preparedCall,
          })
          return res.status(201).json({ ok: true, replayed: false, releaseRequest: publicReleaseRequest(created) })
        }
        if (action === 'rotate_payer_link') {
          const agreementId = String(body.agreementId ?? '').trim()
          if (!/^agr_[a-z0-9]{12,64}$/i.test(agreementId)) {
            throw Object.assign(new Error('A valid agreement id is required.'), { status: 400 })
          }
          const [eventStore, hasActivationAttempt] = await Promise.all([
            dependencies.readEvents(storeKey),
            dependencies.hasActivationAttempt(projectId, agreementId),
          ])
          const hasLifecycleEvent = Object.values(eventStore?.events ?? {}).some(event => (
            event.projectId === projectId && event.agreementId === agreementId
          ))
          if (hasLifecycleEvent || hasActivationAttempt) {
            throw Object.assign(new Error('Payer access cannot be changed after agreement activation has started.'), { status: 409 })
          }
          const rotated = await dependencies.rotatePayerAccess(projectId, agreementId)
          return res.json({
            ok: true,
            agreement: {
              id: rotated.agreement.id,
              title: rotated.agreement.title,
              amount: rotated.agreement.amount,
              recipient: rotated.agreement.recipient,
            },
            payerReviewPath: rotated.payerReviewPath,
          })
        }
        const idempotencyKey = String(req.headers['idempotency-key'] ?? '').trim()
        const reference = createHash('sha256').update(`${projectId}\0${idempotencyKey}`).digest('hex').slice(0, 20)
        const originalBody = req.body
        req.body = {
          template: 'fixed_unlock',
          externalId: `hps-${reference}`,
          resourceId: `agreement:${reference}`,
          title: body.title,
          description: body.description,
          amount: body.amount,
          recipient: body.recipient,
          durationSeconds: body.durationSeconds,
          cancellationWindowSeconds: body.cancellationWindowSeconds,
        }
        try {
          return await dependencies.createAgreement(req, res, policy)
        } finally {
          req.body = originalBody
        }
      }
      const [drafts, eventStore, operatorActions] = await Promise.all([
        dependencies.listAgreements({ partnerId: projectId, limit: 250 }),
        dependencies.readEvents(storeKey),
        dependencies.listOperatorActions({ partnerId: projectId, limit: 250 }),
      ])
      const draftsById = new Map(drafts.map(agreement => [agreement.id, agreement]))
      const eventsByAgreement = new Map<string, StoredEvent[]>()
      for (const event of Object.values(eventStore?.events ?? {})) {
        if (event.projectId !== projectId || !/^agr_[a-z0-9]{12,64}$/i.test(event.agreementId)) continue
        const group = eventsByAgreement.get(event.agreementId) ?? []
        group.push(event)
        eventsByAgreement.set(event.agreementId, group)
      }
      const ids = new Set([...draftsById.keys(), ...eventsByAgreement.keys()])
      const releaseByAgreement = new Map<string, ArcAgreementOperatorAction>()
      for (const action of operatorActions) {
        if (action.action !== 'release' || releaseByAgreement.has(action.agreementId)) continue
        releaseByAgreement.set(action.agreementId, action)
      }
      const agreements = [...ids]
        .map(id => ({
          ...agreementRecord(id, draftsById.get(id), eventsByAgreement.get(id) ?? []),
          releaseRequest: publicReleaseRequest(releaseByAgreement.get(id)),
        }))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      return res.json({
        ok: true,
        project: { id: project.id, name: project.name },
        summary: {
          total: agreements.length,
          active: agreements.filter(item => item.status === 'active').length,
          awaitingStart: agreements.filter(item => item.status === 'awaiting_start').length,
          closed: agreements.filter(item => ['completed', 'cancelled', 'refunded'].includes(item.status)).length,
        },
        agreements,
      })
    } catch (error) {
      const status = Number((error as Error & { status?: number })?.status) || 500
      if (status >= 500) console.error('[hashpaystream-arc-agreements] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(status).json({
        ok: false,
        error: status >= 500 ? 'Hash PayStream Agreements is temporarily unavailable.' : (error as Error).message,
      })
    }
  }
}

export default createHashPayStreamArcAgreementsHandler()

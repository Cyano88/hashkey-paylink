import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import {
  createArcAgreementsHandler,
  listArcAgreementRecords,
  rotateArcAgreementPayerAccess,
  type ArcAgreement,
} from './arc-agreements.js'
import { readArcAgreementActivationAttemptRecord } from './arc-agreement-activation-attempts.js'
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
  authorize: (req: Request, projectId: string) => Promise<{ id: string; name: string; capabilities: string[] }>
  readEvents: (key: string) => Promise<EventStore | undefined>
  listAgreements: (input: { partnerId: string; limit: number }) => Promise<ArcAgreement[]>
  projectPolicy: (projectId: string) => Promise<DeveloperCheckoutPolicy | null>
  createAgreement: (req: Request, res: Response, policy: DeveloperCheckoutPolicy) => Promise<unknown>
  hasActivationAttempt: (partnerId: string, agreementId: string) => Promise<boolean>
  rotatePayerAccess: (partnerId: string, agreementId: string) => ReturnType<typeof rotateArcAgreementPayerAccess>
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
      const [drafts, eventStore] = await Promise.all([
        dependencies.listAgreements({ partnerId: projectId, limit: 250 }),
        dependencies.readEvents(storeKey),
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
      const agreements = [...ids]
        .map(id => agreementRecord(id, draftsById.get(id), eventsByAgreement.get(id) ?? []))
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

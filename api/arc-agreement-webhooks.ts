import { createHash } from 'node:crypto'
import {
  reconcileArcAgreementSnapshot,
  type ArcAgreementChainSnapshot,
  type ArcAgreementPreparedDeployment,
} from './arc-agreement-reconciliation.js'
import {
  readConfirmedArcAgreementSnapshot,
  type ArcAgreementConfirmationClient,
} from './arc-agreement-confirmed-snapshot.js'
import { dispatchDeveloperWebhook } from './developer-projects.js'
import { hasRenderDurableStore, mutateDurableJson } from './render-durable-store.js'

const STORE_KEY = (process.env.ARC_AGREEMENT_WEBHOOK_STORE_KEY ?? 'hashpaylink:arc-agreement-webhooks:v1').trim()
const WEBHOOK_LEASE_MS = 60_000
const WEBHOOK_MAX_ATTEMPTS = 8
const WEBHOOK_RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000, 7_200_000, 21_600_000, 43_200_000]

export type ArcAgreementWebhookName =
  | 'agreement.activated'
  | 'agreement.step_released'
  | 'agreement.completed'
  | 'agreement.cancelled'
  | 'agreement.refunded'

export type ArcAgreementWebhookEvent = {
  id: string
  partnerId: string
  agreementId: string
  event: ArcAgreementWebhookName
  data: Record<string, unknown>
  createdAt: string
  observedBlockNumber: string
  attempts: number
  nextAttemptAt: string
  status: 'pending' | 'delivering' | 'delivered' | 'dead'
  leaseUntil?: string
  deliveredAt?: string
  deadAt?: string
  lastError?: string
}

type ArcAgreementWebhookStore = {
  events: Record<string, ArcAgreementWebhookEvent>
}

export { readConfirmedArcAgreementSnapshot } from './arc-agreement-confirmed-snapshot.js'
export type { ArcAgreementConfirmationClient } from './arc-agreement-confirmed-snapshot.js'

type Dependencies = {
  hasStore: () => boolean
  mutate: (
    key: string,
    update: (current: ArcAgreementWebhookStore | undefined) => ArcAgreementWebhookStore,
  ) => Promise<ArcAgreementWebhookStore>
  notify: typeof dispatchDeveloperWebhook
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  mutate: (key, update) => mutateDurableJson<ArcAgreementWebhookStore>(key, update),
  notify: dispatchDeveloperWebhook,
  now: () => new Date(),
}

function eventName(snapshot: ArcAgreementChainSnapshot): ArcAgreementWebhookName {
  if (snapshot.status === 1) return snapshot.nextStep === 0 ? 'agreement.activated' : 'agreement.step_released'
  if (snapshot.status === 2) return 'agreement.completed'
  if (snapshot.status === 3) return 'agreement.cancelled'
  if (snapshot.status === 4) return 'agreement.refunded'
  throw new Error('Awaiting-funding and invalid agreement states cannot create webhooks.')
}

function stableEventId(snapshot: ArcAgreementChainSnapshot, event: ArcAgreementWebhookName) {
  const digest = createHash('sha256').update(JSON.stringify([
    snapshot.chainId,
    snapshot.escrow.toLowerCase(),
    snapshot.agreementId.toLowerCase(),
    event,
    snapshot.status,
    snapshot.nextStep,
    snapshot.releasedAmount.toString(),
  ])).digest('hex')
  return `evt_${digest.slice(0, 24)}`
}

export function buildArcAgreementWebhookEvent(input: {
  partnerId: string
  agreementId: string
  prepared: ArcAgreementPreparedDeployment
  snapshot: ArcAgreementChainSnapshot
  observedBlockNumber: bigint
  createdAt: string
}): ArcAgreementWebhookEvent {
  if (!/^dev_[a-z0-9]{8,64}$/i.test(input.partnerId)) throw new Error('A developer project id is required.')
  if (!/^agr_[a-z0-9]{12,64}$/i.test(input.agreementId)) throw new Error('A durable agreement id is required.')
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('Webhook creation time is invalid.')
  const reconciliation = reconcileArcAgreementSnapshot(input.prepared, input.snapshot)
  if (!reconciliation.verified) {
    throw new Error(`Agreement snapshot failed reconciliation: ${reconciliation.mismatches.join(', ')}.`)
  }
  const event = eventName(input.snapshot)
  const id = stableEventId(input.snapshot, event)
  const unreleasedAmount = input.prepared.totalAmount - input.snapshot.releasedAmount
  return {
    id,
    partnerId: input.partnerId,
    agreementId: input.agreementId,
    event,
    data: {
      agreementId: input.agreementId,
      onchainAgreementId: input.snapshot.agreementId,
      escrow: input.snapshot.escrow,
      network: 'arc',
      chainId: input.snapshot.chainId,
      status: reconciliation.lifecycle,
      amountUsdcUnits: input.prepared.totalAmount.toString(),
      releasedAmountUsdcUnits: input.snapshot.releasedAmount.toString(),
      unreleasedAmountUsdcUnits: unreleasedAmount.toString(),
      nextStep: input.snapshot.nextStep,
      releaseSteps: input.prepared.cumulativeReleaseBps.length,
      termsHash: input.snapshot.termsHash,
      observedBlockNumber: input.observedBlockNumber.toString(),
    },
    createdAt: input.createdAt,
    observedBlockNumber: input.observedBlockNumber.toString(),
    attempts: 0,
    nextAttemptAt: input.createdAt,
    status: 'pending',
  }
}

export async function queueArcAgreementWebhookEvent(
  event: ArcAgreementWebhookEvent,
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) throw new Error('Arc agreement webhook storage is not configured.')
  let replayed = false
  let durableEvent = event
  await dependencies.mutate(STORE_KEY, current => {
    const safe = current ?? { events: {} }
    const existing = safe.events[event.id]
    if (existing) {
      replayed = true
      durableEvent = existing
      if (
        existing.partnerId !== event.partnerId
        || existing.agreementId !== event.agreementId
        || existing.event !== event.event
      ) {
        throw new Error('Stable agreement event id conflicts with another event.')
      }
      return safe
    }
    return { events: { ...safe.events, [event.id]: event } }
  })
  return { event: durableEvent, replayed }
}

export async function reconcileAndQueueArcAgreementWebhook(input: {
  client: ArcAgreementConfirmationClient
  partnerId: string
  agreementId: string
  prepared: ArcAgreementPreparedDeployment
  escrow: string
  confirmationBlocks?: number
}, dependencies: Dependencies = defaults) {
  const confirmed = await readConfirmedArcAgreementSnapshot(
    input.client,
    input.escrow,
    input.confirmationBlocks,
  )
  const event = buildArcAgreementWebhookEvent({
    partnerId: input.partnerId,
    agreementId: input.agreementId,
    prepared: input.prepared,
    snapshot: confirmed.snapshot,
    observedBlockNumber: confirmed.observedBlockNumber,
    createdAt: dependencies.now().toISOString(),
  })
  const queued = await queueArcAgreementWebhookEvent(event, dependencies)
  return { ...confirmed, ...queued }
}

export async function drainArcAgreementWebhookOutbox(
  dependencies: Dependencies = defaults,
  maxEvents = 10,
) {
  if (!dependencies.hasStore()) return 0
  let delivered = 0
  for (let index = 0; index < Math.max(0, Math.min(maxEvents, 100)); index += 1) {
    let claimed: ArcAgreementWebhookEvent | undefined
    const claimedAt = dependencies.now()
    await dependencies.mutate(STORE_KEY, current => {
      const safe = current ?? { events: {} }
      const nowMs = claimedAt.getTime()
      const candidate = Object.values(safe.events).find(item =>
        (item.status === 'pending' && Date.parse(item.nextAttemptAt) <= nowMs)
        || (item.status === 'delivering' && Date.parse(item.leaseUntil ?? '') <= nowMs)
      )
      if (!candidate) return safe
      claimed = {
        ...candidate,
        status: 'delivering',
        attempts: candidate.attempts + 1,
        leaseUntil: new Date(nowMs + WEBHOOK_LEASE_MS).toISOString(),
      }
      return { events: { ...safe.events, [candidate.id]: claimed } }
    })
    if (!claimed) break

    let failure = ''
    try {
      const deliveryResult = await dependencies.notify(claimed.partnerId, claimed.event, claimed.data, {
        eventId: claimed.id,
        createdAt: claimed.createdAt,
      })
      if (deliveryResult.status !== 'sent') {
        failure = `Webhook delivery skipped: ${deliveryResult.reason}.`
      }
    } catch (error) {
      failure = error instanceof Error ? error.message.slice(0, 240) : 'Webhook delivery failed.'
    }

    const completedAt = dependencies.now()
    await dependencies.mutate(STORE_KEY, current => {
      const safe = current ?? { events: {} }
      const currentEvent = safe.events[claimed!.id]
      if (!currentEvent || currentEvent.status !== 'delivering') return safe
      if (!failure) {
        return {
          events: {
            ...safe.events,
            [claimed!.id]: {
              ...currentEvent,
              status: 'delivered',
              deliveredAt: completedAt.toISOString(),
              leaseUntil: undefined,
              lastError: undefined,
            },
          },
        }
      }
      const dead = currentEvent.attempts >= WEBHOOK_MAX_ATTEMPTS
      const delay = WEBHOOK_RETRY_DELAYS_MS[Math.min(currentEvent.attempts - 1, WEBHOOK_RETRY_DELAYS_MS.length - 1)]
      return {
        events: {
          ...safe.events,
          [claimed!.id]: {
            ...currentEvent,
            status: dead ? 'dead' : 'pending',
            nextAttemptAt: new Date(completedAt.getTime() + delay).toISOString(),
            leaseUntil: undefined,
            deadAt: dead ? completedAt.toISOString() : undefined,
            lastError: failure,
          },
        },
      }
    })
    if (!failure) delivered += 1
  }
  return delivered
}

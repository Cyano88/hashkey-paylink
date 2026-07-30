import { createHash } from 'node:crypto'
import type { Hex } from 'viem'
import {
  assertArcAgreementPreparedOperatorCall,
  type ArcAgreementPreparedOperatorCall,
} from './arc-agreement-operator.js'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from './render-durable-store.js'

const STORE_KEY = (process.env.ARC_AGREEMENT_OPERATOR_ACTION_STORE_KEY
  ?? 'hashpaylink:arc-agreement-operator-actions:v1').trim()
const ACTION_ID = /^opa_[a-f0-9]{24}$/
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const PARTNER_ID = /^dev_[a-z0-9]{8,64}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BYTES32 = /^0x[0-9a-f]{64}$/i
const TX_HASH = /^0x[0-9a-f]{64}$/i

export type ArcAgreementOperatorActionStatus =
  | 'awaiting_review'
  | 'queued'
  | 'provider_pending'
  | 'chain_pending'
  | 'completed'
  | 'failed'
  | 'manual_review'

export type ArcAgreementOperatorAction = {
  id: string
  partnerId: string
  agreementId: string
  action: 'release' | 'cancel'
  step?: number
  evidenceHash: Hex
  evidenceReference: string
  preparedCall: {
    walletId: string
    operatorAddress: `0x${string}`
    contractAddress: `0x${string}`
    abiFunctionSignature: 'releaseStep(uint8,bytes32)' | 'cancelByOperator(bytes32)'
    abiParameters: Array<number | Hex>
    refId: string
  }
  requestHash: string
  idempotencyKey: string
  requestedBy: string
  requestedAt: string
  status: ArcAgreementOperatorActionStatus
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
  providerTransactionId?: string
  providerState?: string
  transactionHash?: Hex
  observedBlockNumber?: string
  completedAt?: string
  failedAt?: string
  lastError?: string
  attempts: number
  leaseToken?: string
  leaseUntil?: string
  nextAttemptAt?: string
  updatedAt: string
}

type ArcAgreementOperatorActionStore = {
  actions: Record<string, ArcAgreementOperatorAction>
  idempotencyIndex: Record<string, string>
}

export type ArcAgreementOperatorActionClaim = Readonly<{
  action: ArcAgreementOperatorAction
  leaseToken: string
}>

type Dependencies = {
  hasStore: () => boolean
  read: (key: string) => Promise<ArcAgreementOperatorActionStore | undefined>
  mutate: (
    key: string,
    update: (
      current: ArcAgreementOperatorActionStore | undefined,
    ) => ArcAgreementOperatorActionStore | Promise<ArcAgreementOperatorActionStore>,
  ) => Promise<ArcAgreementOperatorActionStore>
  now: () => Date
}

const defaults: Dependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: (key, update) => mutateDurableJson<ArcAgreementOperatorActionStore>(key, update),
  now: () => new Date(),
}

function safeStore(value: ArcAgreementOperatorActionStore | undefined): ArcAgreementOperatorActionStore {
  return {
    actions: value?.actions && typeof value.actions === 'object' ? { ...value.actions } : {},
    idempotencyIndex: value?.idempotencyIndex && typeof value.idempotencyIndex === 'object'
      ? { ...value.idempotencyIndex }
      : {},
  }
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function required(value: unknown, pattern: RegExp, label: string, max: number) {
  const normalized = clean(value, max)
  if (!pattern.test(normalized)) throw new Error(`${label} is invalid.`)
  return normalized
}

function requiredActor(value: unknown, label: string) {
  const actor = clean(value, 160)
  if (!/^[a-zA-Z0-9@._:+-]{3,160}$/.test(actor)) throw new Error(`${label} is invalid.`)
  return actor
}

function requiredEvidenceReference(value: unknown) {
  const reference = clean(value, 240)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:/._# -]{5,239}$/.test(reference)) {
    throw new Error('Evidence reference is invalid.')
  }
  return reference
}

function requestDigest(input: {
  partnerId: string
  agreementId: string
  action: 'release' | 'cancel'
  step?: number
  evidenceHash: string
  evidenceReference: string
  operatorAddress: string
  contractAddress: string
  walletId: string
  requestedBy: string
}) {
  return createHash('sha256').update(JSON.stringify({
    schema: 1,
    domain: 'hashpaylink.arc-agreement.operator-action',
    partnerId: input.partnerId,
    agreementId: input.agreementId,
    action: input.action,
    step: input.step ?? null,
    evidenceHash: input.evidenceHash.toLowerCase(),
    evidenceReference: input.evidenceReference,
    operatorAddress: input.operatorAddress.toLowerCase(),
    contractAddress: input.contractAddress.toLowerCase(),
    walletId: input.walletId.toLowerCase(),
    requestedBy: input.requestedBy,
  })).digest('hex')
}

function actionId(requestHash: string) {
  return `opa_${requestHash.slice(0, 24)}`
}

function publicAction(action: ArcAgreementOperatorAction) {
  return Object.freeze({ ...action })
}

function matchesPreparedCall(input: {
  action: 'release' | 'cancel'
  step?: number
  evidenceHash: Hex
  preparedCall: ArcAgreementPreparedOperatorCall
}) {
  const call = assertArcAgreementPreparedOperatorCall(input.preparedCall)
  if (input.action === 'release') {
    return call.abiFunctionSignature === 'releaseStep(uint8,bytes32)'
      && call.abiParameters[0] === input.step
      && String(call.abiParameters[1]).toLowerCase() === input.evidenceHash.toLowerCase()
  }
  return call.abiFunctionSignature === 'cancelByOperator(bytes32)'
    && String(call.abiParameters[0]).toLowerCase() === input.evidenceHash.toLowerCase()
}

export async function createArcAgreementOperatorActionRequest(input: {
  partnerId: string
  agreementId: string
  action: 'release' | 'cancel'
  step?: number
  evidenceHash: string
  evidenceReference: string
  requestedBy: string
  idempotencyKey: string
  preparedCall: ArcAgreementPreparedOperatorCall
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement operator action storage is not configured.')
  const partnerId = required(input.partnerId, PARTNER_ID, 'Developer project id', 80)
  const agreementId = required(input.agreementId, AGREEMENT_ID, 'Agreement id', 80)
  const idempotencyKey = required(input.idempotencyKey, UUID_V4, 'Operator action idempotency key', 36)
  const evidenceHash = required(input.evidenceHash, BYTES32, 'Evidence hash', 66) as Hex
  if (/^0x0{64}$/i.test(evidenceHash)) throw new Error('Evidence hash must be non-zero.')
  const evidenceReference = requiredEvidenceReference(input.evidenceReference)
  const requestedBy = requiredActor(input.requestedBy, 'Operator action requester')
  if (input.action === 'release' && (!Number.isInteger(input.step) || input.step! < 0 || input.step! > 255)) {
    throw new Error('Release step is invalid.')
  }
  if (input.action === 'cancel' && input.step !== undefined) {
    throw new Error('Cancellation requests cannot include a release step.')
  }
  const preparedCall = assertArcAgreementPreparedOperatorCall(input.preparedCall)
  if (
    preparedCall.idempotencyKey !== idempotencyKey
    || preparedCall.refId !== (
      input.action === 'release'
        ? `${agreementId}:release:${input.step}`
        : `${agreementId}:cancel`
    )
    || !matchesPreparedCall({
      action: input.action,
      step: input.step,
      evidenceHash,
      preparedCall,
    })
  ) {
    throw new Error('Operator action request does not match its verified contract call.')
  }
  const requestHash = requestDigest({
    partnerId,
    agreementId,
    action: input.action,
    step: input.step,
    evidenceHash,
    evidenceReference,
    operatorAddress: preparedCall.operatorAddress,
    contractAddress: preparedCall.contractAddress,
    walletId: preparedCall.walletId,
    requestedBy,
  })
  const id = actionId(requestHash)
  const timestamp = dependencies.now().toISOString()
  let durable: ArcAgreementOperatorAction | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const indexedId = store.idempotencyIndex[idempotencyKey]
    const existing = indexedId ? store.actions[indexedId] : store.actions[id]
    if (existing) {
      if (existing.requestHash !== requestHash || existing.idempotencyKey !== idempotencyKey) {
        throw new Error('Operator action idempotency key is already bound to another request.')
      }
      durable = existing
      return store
    }
    const action: ArcAgreementOperatorAction = {
      id,
      partnerId,
      agreementId,
      action: input.action,
      ...(input.action === 'release' ? { step: input.step } : {}),
      evidenceHash,
      evidenceReference,
      preparedCall: {
        walletId: preparedCall.walletId,
        operatorAddress: preparedCall.operatorAddress,
        contractAddress: preparedCall.contractAddress,
        abiFunctionSignature: preparedCall.abiFunctionSignature,
        abiParameters: [...preparedCall.abiParameters],
        refId: preparedCall.refId,
      },
      requestHash,
      idempotencyKey,
      requestedBy,
      requestedAt: timestamp,
      status: 'awaiting_review',
      attempts: 0,
      updatedAt: timestamp,
    }
    store.actions[id] = action
    store.idempotencyIndex[idempotencyKey] = id
    durable = action
    return store
  })
  if (!durable) throw new Error('Operator action request was not persisted.')
  return publicAction(durable)
}

export async function approveArcAgreementOperatorAction(input: {
  actionId: string
  requestHash: string
  reviewedBy: string
  reviewNote: string
}, dependencies: Dependencies = defaults) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement operator action storage is not configured.')
  const id = required(input.actionId, ACTION_ID, 'Operator action id', 28)
  const requestHash = required(input.requestHash, /^[a-f0-9]{64}$/, 'Operator action request hash', 64)
  const reviewedBy = requiredActor(input.reviewedBy, 'Operator action reviewer')
  const reviewNote = clean(input.reviewNote, 300)
  if (reviewNote.length < 8) throw new Error('Operator action review note is required.')
  let durable: ArcAgreementOperatorAction | undefined
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const action = store.actions[id]
    if (!action) throw new Error('Operator action request was not found.')
    if (action.requestHash !== requestHash) throw new Error('Operator action changed after evidence review.')
    if (action.requestedBy === reviewedBy) throw new Error('Operator action requires an independent reviewer.')
    if (action.status !== 'awaiting_review') {
      durable = action
      return store
    }
    const conflicting = Object.values(store.actions).find(item => (
      item.id !== action.id
      && item.partnerId === action.partnerId
      && item.agreementId === action.agreementId
      && ['queued', 'provider_pending', 'chain_pending', 'manual_review'].includes(item.status)
    ))
    if (conflicting) {
      throw new Error('Another operator action is already open for this agreement.')
    }
    const timestamp = dependencies.now().toISOString()
    durable = {
      ...action,
      status: 'queued',
      reviewedBy,
      reviewedAt: timestamp,
      reviewNote,
      updatedAt: timestamp,
    }
    store.actions[id] = durable
    return store
  })
  if (!durable) throw new Error('Operator action approval was not persisted.')
  return publicAction(durable)
}

function claimable(action: ArcAgreementOperatorAction) {
  return ['queued', 'provider_pending', 'chain_pending'].includes(action.status)
    && Boolean(action.reviewedBy && action.reviewedAt && action.reviewNote)
}

export async function claimArcAgreementOperatorActions(input: {
  workerId: string
  maxAttempts?: number
  leaseMs?: number
}, dependencies: Dependencies = defaults): Promise<ArcAgreementOperatorActionClaim[]> {
  if (!dependencies.hasStore()) return []
  const workerId = requiredActor(input.workerId, 'Operator worker id')
  const maximum = Math.min(25, Math.max(1, Math.trunc(input.maxAttempts ?? 10)))
  const leaseMs = Math.min(180_000, Math.max(10_000, Math.trunc(input.leaseMs ?? 60_000)))
  const now = dependencies.now()
  const timestamp = now.toISOString()
  const claims: ArcAgreementOperatorActionClaim[] = []
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const claimedAgreements = new Set<string>()
    for (const action of Object.values(store.actions).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
      if (claims.length >= maximum) break
      if (!claimable(action)) continue
      const agreementKey = `${action.partnerId}\0${action.agreementId}`
      if (claimedAgreements.has(agreementKey)) continue
      if (action.leaseUntil && Date.parse(action.leaseUntil) > now.getTime()) continue
      if (action.nextAttemptAt && Date.parse(action.nextAttemptAt) > now.getTime()) continue
      const attempts = action.attempts + 1
      const leaseToken = createHash('sha256')
        .update(`${workerId}\0${action.id}\0${timestamp}\0${attempts}`)
        .digest('hex')
      const next = {
        ...action,
        attempts,
        leaseToken,
        leaseUntil: new Date(now.getTime() + leaseMs).toISOString(),
        updatedAt: timestamp,
      }
      store.actions[action.id] = next
      claimedAgreements.add(agreementKey)
      claims.push(Object.freeze({ action: publicAction(next), leaseToken }))
    }
    return store
  })
  return claims
}

async function updateClaim(
  input: { actionId: string; leaseToken: string },
  update: (action: ArcAgreementOperatorAction, timestamp: string) => ArcAgreementOperatorAction,
  dependencies: Dependencies,
) {
  await dependencies.mutate(STORE_KEY, current => {
    const store = safeStore(current)
    const action = store.actions[input.actionId]
    if (!action || action.leaseToken !== input.leaseToken) return store
    store.actions[action.id] = update(action, dependencies.now().toISOString())
    return store
  })
}

export async function recordArcAgreementOperatorSubmission(input: {
  actionId: string
  leaseToken: string
  providerTransactionId: string
}, dependencies: Dependencies = defaults) {
  const providerTransactionId = required(
    input.providerTransactionId,
    UUID,
    'Circle operator transaction id',
    36,
  )
  await updateClaim(input, (action, timestamp) => {
    if (
      action.providerTransactionId
      && action.providerTransactionId.toLowerCase() !== providerTransactionId.toLowerCase()
    ) {
      return {
        ...action,
        status: 'manual_review',
        lastError: 'Circle returned a different transaction for the durable operator action.',
        leaseToken: undefined,
        leaseUntil: undefined,
        updatedAt: timestamp,
      }
    }
    return {
      ...action,
      status: 'provider_pending',
      providerTransactionId,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextAttemptAt: new Date(dependencies.now().getTime() + 5_000).toISOString(),
      updatedAt: timestamp,
    }
  }, dependencies)
}

export async function rescheduleArcAgreementOperatorAction(input: {
  actionId: string
  leaseToken: string
  status: 'queued' | 'provider_pending' | 'chain_pending'
  providerState?: string
  transactionHash?: string
  retryAfterMs?: number
}, dependencies: Dependencies = defaults) {
  const providerState = clean(input.providerState, 40).toUpperCase()
  const transactionHash = input.transactionHash
    ? required(input.transactionHash, TX_HASH, 'Operator transaction hash', 66) as Hex
    : undefined
  const retryAfterMs = Math.min(300_000, Math.max(5_000, Math.trunc(input.retryAfterMs ?? 10_000)))
  await updateClaim(input, (action, timestamp) => ({
    ...action,
    status: input.status,
    ...(providerState ? { providerState } : {}),
    ...(transactionHash ? { transactionHash } : {}),
    leaseToken: undefined,
    leaseUntil: undefined,
    nextAttemptAt: new Date(dependencies.now().getTime() + retryAfterMs).toISOString(),
    updatedAt: timestamp,
  }), dependencies)
}

export async function completeArcAgreementOperatorAction(input: {
  actionId: string
  leaseToken: string
  providerState: string
  transactionHash: string
  observedBlockNumber: string
}, dependencies: Dependencies = defaults) {
  const providerState = clean(input.providerState, 40).toUpperCase()
  const transactionHash = required(input.transactionHash, TX_HASH, 'Operator transaction hash', 66) as Hex
  const observedBlockNumber = required(input.observedBlockNumber, /^[0-9]{1,30}$/, 'Observed Arc block number', 30)
  await updateClaim(input, (action, timestamp) => ({
    ...action,
    status: 'completed',
    providerState,
    transactionHash,
    observedBlockNumber,
    completedAt: timestamp,
    leaseToken: undefined,
    leaseUntil: undefined,
    nextAttemptAt: undefined,
    lastError: undefined,
    updatedAt: timestamp,
  }), dependencies)
}

export async function failArcAgreementOperatorAction(input: {
  actionId: string
  leaseToken: string
  error: unknown
  manualReview?: boolean
  definitive?: boolean
}, dependencies: Dependencies = defaults) {
  const message = (input.error instanceof Error ? input.error.message : String(input.error))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || 'Arc Agreement operator action failed.'
  await updateClaim(input, (action, timestamp) => {
    const terminal = input.manualReview || input.definitive
    const retryMs = Math.min(300_000, 5_000 * (2 ** Math.min(6, Math.max(0, action.attempts - 1))))
    return {
      ...action,
      status: input.manualReview ? 'manual_review' : input.definitive ? 'failed' : action.status,
      lastError: message,
      ...(terminal ? { failedAt: timestamp } : {
        nextAttemptAt: new Date(dependencies.now().getTime() + retryMs).toISOString(),
      }),
      leaseToken: undefined,
      leaseUntil: undefined,
      updatedAt: timestamp,
    }
  }, dependencies)
}

export async function readArcAgreementOperatorAction(
  actionId: string,
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) throw new Error('Arc Agreement operator action storage is not configured.')
  const id = required(actionId, ACTION_ID, 'Operator action id', 28)
  const store = await dependencies.read(STORE_KEY)
  const action = store?.actions?.[id]
  if (!action) throw new Error('Operator action request was not found.')
  return publicAction(action)
}

export async function listArcAgreementOperatorActions(
  input: { partnerId?: string; agreementId?: string; limit?: number } = {},
  dependencies: Dependencies = defaults,
) {
  if (!dependencies.hasStore()) return []
  const partnerId = input.partnerId
    ? required(input.partnerId, PARTNER_ID, 'Developer project id', 80)
    : ''
  const agreementId = input.agreementId
    ? required(input.agreementId, AGREEMENT_ID, 'Agreement id', 80)
    : ''
  const limit = Math.min(250, Math.max(1, Math.trunc(input.limit ?? 100)))
  const store = await dependencies.read(STORE_KEY)
  return Object.values(store?.actions ?? {})
    .filter(action => (!partnerId || action.partnerId === partnerId)
      && (!agreementId || action.agreementId === agreementId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map(publicAction)
}
